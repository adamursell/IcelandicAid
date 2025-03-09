import os
import json
import logging
import sys
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from anthropic import Anthropic
import re

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------
# Load Environment Variables
# ---------------------------
load_dotenv("APIKey.env")
API_KEY = os.getenv("APIKey")
if not API_KEY:
    raise ValueError("Please set the ANTHROPIC_API_KEY environment variable in APIKey.env")

# ---------------------------
# SQLAlchemy Setup & Database Models
# ---------------------------
from sqlalchemy import create_engine, Column, Integer, String, Text, TIMESTAMP, ForeignKey
from sqlalchemy.orm import relationship, declarative_base, sessionmaker
from sqlalchemy.sql import func

# Database configuration
DATABASE_URL = "sqlite:///AppDatabase.db"  # Changed to Users.db
engine = create_engine(DATABASE_URL, echo=False)  # Add echo=True for debugging
Base = declarative_base()
Session = sessionmaker(bind=engine)
session = Session()

# Define Models
class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    profession = Column(String(255))
    hobbies = Column(String(255))
    interests = Column(String(255))
    skill_level = Column(String(50))
    gender = Column(String(50), default='neutral')
    additional_info = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())
    
    # Add relationships
    libraries = relationship('FlashcardLibrary', backref='user', cascade='all, delete-orphan')
    generations = relationship('FlashcardGeneration', backref='user', cascade='all, delete-orphan')

class FlashcardLibrary(Base):
    __tablename__ = 'flashcard_libraries'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"))
    library_name = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

class FlashcardGeneration(Base):
    __tablename__ = 'flashcard_generations'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"))
    prompt_template_version = Column(String(50))
    flashcard_topic = Column(String(255))
    skill_level = Column(String(50))
    speaker_profile = Column(Text)
    raw_output = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

class Flashcard(Base):
    __tablename__ = 'flashcards'
    id = Column(Integer, primary_key=True)
    library_id = Column(Integer, ForeignKey('flashcard_libraries.id', ondelete="CASCADE"))
    front_text = Column(String(255), nullable=False)
    back_text = Column(String(255), nullable=False)
    additional_info = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

class Conversation(Base):
    __tablename__ = 'conversations'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"))
    scenario = Column(String(255))
    completed_at = Column(TIMESTAMP)
    overall_feedback = Column(Text)
    main_strengths = Column(Text)
    areas_to_improve = Column(Text)
    overall_score = Column(Integer)

class ConversationMessage(Base):
    __tablename__ = 'conversation_messages'
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey('conversations.id', ondelete="CASCADE"))
    role = Column(String(50))
    content = Column(Text)
    feedback = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

# Create the tables in the database (if they don't already exist)
Base.metadata.create_all(engine)
logger.info("Database tables created.")

# ---------------------------
# Anthropic API Client Wrapper
# ---------------------------
class AnthropicClientWrapper:
    """
    Wraps the Anthropic client for generating flashcards.
    """
    def __init__(self, api_key: str):
        self.client = Anthropic(api_key=api_key)
        logger.info("Anthropic client initialized.")

    @staticmethod
    def extract_response_text(message) -> str:
        """
        Extracts the text content from the response message.
        """
        try:
            if hasattr(message, 'content'):
                if isinstance(message.content, list) and message.content:
                    first_content = message.content[0]
                    if hasattr(first_content, 'text'):
                        return first_content.text
            logger.warning("Unexpected response structure from API: %s", message)
            return ""
        except Exception as e:
            logger.error("Error extracting response: %s", e)
            return ""

    @staticmethod
    def process_response_as_json(response_string: str) -> dict:
        """
        Processes the response string as JSON.
        """
        try:
            data = json.loads(response_string)
            return data
        except json.JSONDecodeError as e:
            logger.error("Error decoding JSON: %s", e)
            return {}

    def get_flashcard_response(self, system_prompt: str, user_prompt: str,
                               model: str = "claude-3-5-sonnet-20241022",
                               max_tokens: int = 8192,
                               temperature: float = 0) -> dict:
        """
        Sends the prompt to the Anthropic API and returns the processed JSON response.
        """
        message_history = [
            {
                "role": "user",
                "content": [{"type": "text", "text": user_prompt}]
            }
        ]
        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=message_history
            )
            response_text = self.extract_response_text(response)
            json_response = self.process_response_as_json(response_text)
            return json_response
        except Exception as e:
            logger.error("Error getting flashcard response: %s", e)
            return {}

# ---------------------------
# Flashcard Generator Class
# ---------------------------
class FlashcardGenerator:
    """
    Main class to generate flashcards from user inputs using prompt templates.
    """
    def __init__(self, anthropic_client: AnthropicClientWrapper,
                 prompt_templates: dict,
                 system_prompt_templates: dict,
                 prompt_template_version: str,
                 system_prompt_template_version: str,
                 claude_temperature: float = 0):
        self.client = anthropic_client
        self.prompt_templates = prompt_templates
        self.system_prompt_templates = system_prompt_templates
        self.prompt_template_version = prompt_template_version
        self.system_prompt_template_version = system_prompt_template_version
        self.claude_temperature = claude_temperature

    def build_user_prompt(self, variables: dict) -> str:
        """
        Build the user prompt from the template and variables.
        """
        template = self.prompt_templates[self.prompt_template_version]
        return template.format(**variables)

    def generate_flashcards(self, quantity: int, flashcard_topic: str,
                              skill_level: str, speaker_profile: str) -> dict:
        """
        Generates flashcards by sending the built prompt to the Anthropic API.
        Returns the raw JSON response.
        """
        variables = {
            "quantity": quantity,
            "flashcard_topic": flashcard_topic,
            "skill_level": skill_level,
            "speaker_profile": speaker_profile
        }
        user_prompt = self.build_user_prompt(variables)
        system_prompt = self.system_prompt_templates[self.system_prompt_template_version]

        logger.info("Sending prompt to Anthropic API...")
        response_json = self.client.get_flashcard_response(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=self.claude_temperature
        )

        if not response_json or "word_pairs" not in response_json:
            logger.error("Invalid or empty response from API.")
            return {}
        return response_json

# ---------------------------
# Flask API Endpoints
# ---------------------------
app = Flask(__name__)
CORS(app)  # This enables CORS for all routes

# Add this before the Flask app setup
FLASHCARD_PROMPT = """You are an expert Icelandic language teacher. Your task is to create flashcards for learning Icelandic, tailored to the user's profile and needs.

Topic: {TOPIC}

User Profile:
- Skill Level: {USER_SKILL_LEVEL}
- Profession: {USER_PROFESSION}
- Hobbies: {USER_HOBBIES}
- Interests: {USER_INTERESTS}
- Gender: {USER_GENDER}

Please generate a set of 10 flashcards related to the topic. Each flashcard should have:
1. An Icelandic word or phrase on the front
2. The English translation on the back

Format your response as a JSON object with this structure:
{{
    "flashcards": [
        {{
            "front": "Icelandic word/phrase",
            "back": "English translation"
        }},
        ...
    ]
}}

Make sure the difficulty level matches the user's skill level and the examples are relevant to their interests when possible."""

# First, define the new system prompt at the top level with other constants
FLASHCARD_SYSTEM_PROMPT = """You are an expert Icelandic language teacher as part of an AI-powered flashcard generation system. Your specific role is to generate precise English-Icelandic word pairs that follow strict grammatical formatting rules.

Required JSON Output Structure:
You must return a JSON object with exactly this structure:
{
    "flashcards": [
        {
            "front": "to speak",
            "back": "að tala (tala, talaði, töluðum, talað)",
            "additional_info": "verb"
        },
        {
            "front": "house",
            "back": "hús",
            "additional_info": "noun (n)"
        },
        {
            "front": "beautiful",
            "back": "fallegur",
            "additional_info": "adjective (masculine nominative singular)"
        }
    ]
}

Strict Formatting Rules for Each Field:
1. "front": English word/phrase
   - Clear and concise English translation

2. "back": Icelandic word/phrase with grammatical forms
   - For verbs: Include infinitive with 'að' + all principal parts in brackets
     Format: "að (ég present, ég past, við past, supine)"
   - For nouns: Use nominative singular form
   - For adjectives: Use masculine nominative singular form

3. "additional_info": Grammatical information (REQUIRED FOR EVERY FLASHCARD)
   - For verbs: "verb"
   - For nouns: "noun (m)", "noun (f)", or "noun (n)" for gender
   - For adjectives: "adjective (masculine nominative singular)"
   - For other word types: Specify part of speech and any relevant grammatical info. For example, "preposition"

You will receive:
- Topic: {topic}
- Quantity: {quantity} flashcards to generate
- User Profile:
  - Skill Level: {skill_level}
  - Profession: {profession}
  - Hobbies: {hobbies}
  - Interests: {interests}
  - Gender: {gender}

Guidelines:
- Generate exactly {quantity} flashcards
- Ensure all flashcards include all three required fields
- Follow the exact JSON structure shown above
- Include complete grammatical information for Icelandic words
- Match difficulty to user's skill level
- Include vocabulary relevant to user's profile
- Double-check all principal parts of verbs
- Verify gender markings for all nouns
- Ensure all adjectives are in masculine nominative singular

Example Output:
{
    "flashcards": [
        {
            "front": "to lie / tell falsehoods",
            "back": "að ljúga (lýg, laug, laugum, logið)",
            "additional_info": "verb"
        },
        {
            "front": "computer",
            "back": "tölva",
            "additional_info": "noun (f)"
        },
        {
            "front": "happy",
            "back": "glaður",
            "additional_info": "adjective (masculine nominative singular)"
        }
    ]
}

Output only valid JSON with no additional text or explanations. Every flashcard must include all three fields (front, back, additional_info) formatted exactly as shown in the example."""

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"message": "API is running!"}), 200

################# Login and registering endpoints
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    profession = data.get('profession')
    hobbies = data.get('hobbies')
    interests = data.get('interests')
    skill_level = data.get('skillLevel')
    additional_info = data.get('additionalInfo')

    if not all([email, password, profession, hobbies, interests, skill_level, additional_info]):
        return jsonify({'message': 'All fields are required'}), 400

    # Hash the password before storing
    hashed_password = generate_password_hash(password)

    try:
        # Check if email already exists
        if session.query(User).filter_by(email=email).first():
            return jsonify({'message': 'Email is already registered'}), 409

        new_user = User(
            email=email,
            password_hash=hashed_password,
            profession=profession,
            hobbies=hobbies,
            interests=interests,
            skill_level=skill_level,
            additional_info=additional_info
        )
        session.add(new_user)
        session.commit()
        return jsonify({'message': 'User created successfully'}), 201

    except Exception as e:
        session.rollback()
        return jsonify({'message': f'Database error: {str(e)}'}), 500
    finally:
        session.close()

# Route for user login
@app.route('/login', methods=['POST'])
def login():
    # Getting email and password information sent from front end
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    # Need both of these to be able to login
    if not email or not password:
        return jsonify({'message': 'Email and password are required to login'}), 400

    user = session.query(User).filter_by(email=email).first()
    session.close()

    if not user:
        return jsonify({'message': 'Invalid email or password'}), 401  # 401 Unauthorized

    # Check the password against the stored hash
    if check_password_hash(user.password_hash, password):
        # Fetch user ID and return it in the response
        user_id = user.id
        return jsonify({'message': 'Login successful', 'user_id': user_id}), 200
    else:
        return jsonify({'message': 'Invalid email or password'}), 401

# Add this new endpoint after the login/register endpoints
@app.route('/users/<int:user_id>', methods=['GET', 'PUT'])
def manage_user(user_id):
    """Get or update user information."""
    try:
        user = session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        if request.method == 'GET':
            return jsonify({
                "email": user.email,
                "profession": user.profession,
                "hobbies": user.hobbies,
                "interests": user.interests,
                "skill_level": user.skill_level,
                "additional_info": user.additional_info,
                "gender": user.gender
            }), 200

        elif request.method == 'PUT':
            data = request.get_json()
            
            # Update password if provided
            if data.get('password'):
                user.password_hash = generate_password_hash(data['password'])
            
            # Update other fields
            user.profession = data.get('profession', user.profession)
            user.hobbies = data.get('hobbies', user.hobbies)
            user.interests = data.get('interests', user.interests)
            user.skill_level = data.get('skill_level', user.skill_level)
            user.additional_info = data.get('additional_info', user.additional_info)
            user.gender = data.get('gender', user.gender)

            session.commit()
            return jsonify({"message": "User information updated successfully"}), 200

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500

################# flashcard generator view endpoints
@app.route('/generate_flashcards', methods=['POST'])
def generate_flashcards():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        user_id = data.get('user_id')
        topic = data.get('topic')
        quantity = data.get('quantity', 10)

        logger.info(f"Generating flashcards for user {user_id}, topic: {topic}")

        if not user_id or not topic:
            return jsonify({"error": "Missing required fields: user_id and topic"}), 400

        # Get user profile from database
        user = session.get(User, user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        try:
            # Generate flashcards using Claude
            client = Anthropic(api_key=API_KEY)
            
            # Log the exact prompt being sent
            formatted_prompt = f"Generate {quantity} flashcards about {topic} in Icelandic."
            logger.info(f"Sending prompt to Claude: {formatted_prompt}")
            logger.info(f"Using system prompt: {FLASHCARD_SYSTEM_PROMPT}")

            response = client.messages.create(
                model="claude-3-opus-20240229",
                max_tokens=2000,
                temperature=0.7,
                system=FLASHCARD_SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": formatted_prompt
                }]
            )

            # Parse the response
            response_text = response.content[0].text
            logger.info("Raw response from Claude: %s", response_text)
            logger.info("Response type: %s", type(response_text))
            logger.info("Response length: %d", len(response_text))

            try:
                # Clean the response text and parse JSON
                cleaned_text = response_text.strip()
                logger.info("Cleaned text: %s", cleaned_text)
                
                flashcards_data = json.loads(cleaned_text)
                logger.info("Parsed JSON data: %s", flashcards_data)
                
                if not isinstance(flashcards_data, dict):
                    logger.error(f"Response is not a dictionary: {flashcards_data}")
                    return jsonify({"error": "Invalid response format from AI"}), 500

                if 'flashcards' not in flashcards_data:
                    logger.error(f"Missing 'flashcards' key in response: {flashcards_data}")
                    return jsonify({"error": "Invalid response format from AI"}), 500

                return jsonify({
                    "message": "Flashcards generated successfully",
                    "flashcards": flashcards_data['flashcards']
                }), 200

            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error: {str(e)}\nResponse text: {response_text}")
                return jsonify({"error": "Failed to parse AI response"}), 500

        except Exception as e:
            logger.error(f"Error generating flashcards: {str(e)}")
            return jsonify({"error": f"Failed to generate flashcards: {str(e)}"}), 500

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/save_to_library', methods=['POST'])
def save_to_library():
    local_session = Session()  # Create a new session for this request
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        flashcard_data = data.get('flashcard')
        
        logger.info(f"Attempting to save flashcard: {flashcard_data}")
        logger.info(f"For user: {user_id}")

        if not user_id or not flashcard_data:
            return jsonify({"error": "Missing required fields"}), 400

        # Find or create library
        library = (local_session.query(FlashcardLibrary)
                  .filter_by(user_id=user_id, library_name=flashcard_data['topic'])
                  .first())
        
        if not library:
            logger.info("Creating new library")
            library = FlashcardLibrary(
                user_id=user_id,
                library_name=flashcard_data['topic']
            )
            local_session.add(library)
            local_session.commit()  # Commit to get the library ID
            logger.info(f"Created library with ID: {library.id}")

        # Create new flashcard
        try:
            new_card = Flashcard(
                library_id=library.id,  # Removed user_id since it's not in the model
                front_text=flashcard_data['front'],
                back_text=flashcard_data['back'],
                additional_info=flashcard_data.get('additional_info', '')
            )
            local_session.add(new_card)
            local_session.commit()
            logger.info(f"Successfully saved flashcard with ID: {new_card.id}")
            
            return jsonify({
                "message": "Flashcard saved successfully",
                "flashcard_id": new_card.id
            }), 200

        except Exception as e:
            local_session.rollback()
            logger.error(f"Error creating flashcard: {str(e)}")
            return jsonify({"error": f"Failed to create flashcard: {str(e)}"}), 500

    except Exception as e:
        logger.error(f"Error saving to library: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
    finally:
        local_session.close()  # Always close the session

################# View and edit flashcard library endpoints
# Endpoint to get a list of flashcards based on user and sorts
@app.route('/users/<int:user_id>/flashcards', methods=['GET'])
def get_user_flashcards(user_id):
    try:
        logger.info(f"Fetching flashcards for user: {user_id}")
        
        # Join Flashcard with FlashcardLibrary to get user's flashcards
        flashcards = (session.query(Flashcard)
                     .join(FlashcardLibrary)
                     .filter(FlashcardLibrary.user_id == user_id)
                     .all())
        
        logger.info(f"Found {len(flashcards)} flashcards")

        results = [{
            "id": fc.id,
            "front": fc.front_text,
            "back": fc.back_text,
            "additional_info": fc.additional_info or "",
            "topic": session.query(FlashcardLibrary).get(fc.library_id).library_name
        } for fc in flashcards]

        return jsonify({"flashcards": results}), 200

    except Exception as e:
        logger.error(f"Error retrieving flashcards: {str(e)}")
        return jsonify({"error": f"Failed to retrieve flashcards: {str(e)}"}), 500

# API end point to remove a flashcard
@app.route('/flashcards/<int:flashcard_id>', methods=['DELETE'])
def delete_flashcard(flashcard_id):
    """
    Delete a specific flashcard from the database.
    """
    try:
        flashcard = session.query(Flashcard).get(flashcard_id)
        if not flashcard:
            return jsonify({"error": "Flashcard not found"}), 404
            
        session.delete(flashcard)
        session.commit()
        return jsonify({"message": "Flashcard deleted successfully."}), 200
        
    except Exception as e:
        logger.error(f"Error deleting flashcard: {e}")
        session.rollback()
        return jsonify({"error": f"Failed to delete flashcard: {str(e)}"}), 500

# Api endpoint to edit a flashcard
@app.route('/flashcards/<int:flashcard_id>', methods=['PUT'])
def update_flashcard(flashcard_id):
    """
    Update a specific flashcard in the database.
    """
    data = request.get_json()
    front = data.get("front")
    back = data.get("back")
    additional_info = data.get("additional_info")

    try:
        # Get the flashcard from the database
        flashcard = session.query(Flashcard).get(flashcard_id)
        if not flashcard:
            return jsonify({"error": "Flashcard not found"}), 404

        # Update the fields if they are provided
        if front is not None:
            flashcard.front_text = front
        if back is not None:
            flashcard.back_text = back
        if additional_info is not None:
            flashcard.additional_info = additional_info

        # Commit the changes
        session.commit()

        return jsonify({
            "message": "Flashcard updated successfully",
            "flashcard": {
                "id": flashcard.id,
                "front": flashcard.front_text,
                "back": flashcard.back_text,
                "additional_info": flashcard.additional_info,
                "topic": session.query(FlashcardLibrary).get(flashcard.library_id).library_name
            }
        }), 200

    except Exception as e:
        logger.error(f"Error updating flashcard: {str(e)}")
        session.rollback()
        return jsonify({"error": str(e)}), 500

################# Flashcard practice API endpoints

@app.route('/users/<int:user_id>/topics', methods=['GET'])
def get_user_topics(user_id):
    """Get all available flashcard topics for a user."""
    try:
        # Query distinct topics from user's libraries that have flashcards
        topics = (session.query(FlashcardLibrary.library_name)
                 .filter(FlashcardLibrary.user_id == user_id)
                 .join(Flashcard)  # Join with Flashcard table
                 .group_by(FlashcardLibrary.library_name)
                 .having(func.count(Flashcard.id) > 0)  # Only include topics with flashcards
                 .distinct()
                 .all())
        
        # Convert list of tuples to list of strings
        topic_list = [topic[0] for topic in topics]
        
        return jsonify({
            "topics": topic_list
        }), 200

    except Exception as e:
        logger.error(f"Error fetching topics: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/users/<int:user_id>/practice', methods=['GET'])
def get_practice_flashcards(user_id):
    try:
        num_flashcards = request.args.get('num_flashcards', default=10, type=int)
        topic = request.args.get('topic', default=None, type=str)
        
        # Base query joining Flashcard with FlashcardLibrary
        query = (session.query(Flashcard)
                .join(FlashcardLibrary)
                .filter(FlashcardLibrary.user_id == user_id))
        
        # If specific topic is requested (and it's not "all")
        if topic and topic.lower() != 'all':
            query = query.filter(FlashcardLibrary.library_name == topic)
        
        # Get total available cards for the query
        total_cards = query.count()
        
        # Adjust num_flashcards if it exceeds available cards
        num_flashcards = min(num_flashcards, total_cards)
        
        # Get random selection of flashcards
        flashcards = (query
                     .order_by(func.random())
                     .limit(num_flashcards)
                     .all())
        
        if not flashcards:
            return jsonify({
                "message": "No flashcards found", 
                "flashcards": [],
                "total_available": 0
            }), 200

        results = [{
            "id": fc.id,
            "front": fc.front_text,
            "back": fc.back_text,
            "additional_info": fc.additional_info,
            "topic": session.query(FlashcardLibrary).get(fc.library_id).library_name
        } for fc in flashcards]

        return jsonify({
            "flashcards": results,
            "total_available": total_cards
        }), 200

    except Exception as e:
        logger.error(f"Error fetching practice flashcards: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/users/<int:user_id>/practice/next', methods=['POST'])
def get_next_practice_card(user_id):
    """Get next flashcard when a card is kept for more practice."""
    try:
        data = request.get_json()
        current_card_id = data.get('current_card_id')
        topic = data.get('topic')
        
        # Base query
        query = (session.query(Flashcard)
                .join(FlashcardLibrary)
                .filter(FlashcardLibrary.user_id == user_id))
        
        # Apply topic filter if specified
        if topic and topic.lower() != 'all':
            query = query.filter(FlashcardLibrary.library_name == topic)
        
        # Get a random card that's not the current card
        if current_card_id:
            query = query.filter(Flashcard.id != current_card_id)
        
        next_card = query.order_by(func.random()).first()
        
        if not next_card:
            return jsonify({"message": "No more cards available"}), 404
            
        result = {
            "id": next_card.id,
            "front": next_card.front_text,
            "back": next_card.back_text,
            "additional_info": next_card.additional_info,
            "topic": session.query(FlashcardLibrary).get(next_card.library_id).library_name
        }
        
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error fetching next practice flashcard: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Add your system prompt here

CONVERSATION_SYSTEM_PROMPT ="""You are an expert Icelandic teacher helping a student learn through role-playing a scenario conversation in Icelandic. Your task is to engage in a natural, contextually appropriate conversation while tailoring your language to the student's skill level and their user profile. You should also focus on their target practice areas.\n\nHere is the scenario context provided by the student:\n<scenario_context> {SCENARIO_CONTEXT} </scenario_context>\n\nThe student's current skill level in Icelandic is:\n<skill_level> {USER_SKILL_LEVEL} </skill_level>\n\nThe student's target practice areas are:\n<practice_areas> {USER_PRACTICE_AREAS} </practice_areas>\n\n Information about the student from their user profile is:\n<user_profile>\n- Profession: {USER_PROFESSION}\n- Hobbies: {USER_HOBBIES}\n- Interests: {USER_INTERESTS}\n- Gender: {USER_GENDER}\n</user_profile>Follow these guidelines throughout the conversation:\n1. Use only Icelandic in the conversation responses (icelandic_text field), ensuring perfect grammar and appropriate vocabulary for the situation, the student's skill level and use the correct gender when referring to the student in the conversation.\n2. Maintain a natural flow of conversation within the context of the scenario.\n3. Tailor your language complexity and vocabulary choices to match the student's skill level, gradually introducing more advanced concepts as appropriate.\n4. Incorporate opportunities for the student to practice their target areas whenever possible within the context of the conversation.\n5. Stay in character throughout the entire role-play scenario, even if the student's input is out of context or non-sensical. Attempt to steer the conversation back to the scenario context naturally.\n6. Only break character in extreme cases where the student's input is offensive. In such cases, end the conversation immediately.\n7. End the conversation naturally by setting conversation_complete to true after 4-6 exchanges and/or when:\n   - The scenario objectives have been met\n   - The conversation has reached a natural conclusion\n   - The student has had sufficient practice opportunities\n   - The student requests to end the conversation through the text\n\n8. Format your responses in JSON format as follows:\n{{\n  "response": {{\n    "icelandic_text": "Your Icelandic response goes here in Icelandic",\n    "english_translation": "Your English translation goes here in English",\n    "conversation_complete": false (if conversation not complete) or true (if conversation is complete),\n    "grammar_notes": ["List any grammar corrections or suggestions for the STUDENT'S PREVIOUS MESSAGE here with brief explanation in English"],\n    "vocabulary_suggestions": {{"used_word_by_student": "suggested_better_alternative (with brief explanation in English)"}},\n    "overall_feedback": "Either 'Nice response, well done!' or a brief summary of main areas for improvement in the STUDENT'S PREVIOUS MESSAGE in English"\n  }}\n}}\n\nWhen providing feedback:\n- CRITICAL: ALL FEEDBACK MUST BE PROVIDED IN ENGLISH ONLY, NEVER IN ICELANDIC. This includes grammar_notes, vocabulary_suggestions, and overall_feedback.\n- IMPORTANT: The feedback (grammar_notes, vocabulary_suggestions, and overall_feedback) should ONLY be about the STUDENT'S PREVIOUS MESSAGE, not your own response.\n- Grammar notes should be a list of strings or an empty list if no corrections are needed in the student's message.\n- Vocabulary suggestions should be a dictionary where the keys are the words used by the student, and the values are the suggested better alternatives.\n- Keep feedback concise and constructive\n- If the student's response was perfect, set grammar_notes to an empty list, vocabulary_suggestions to an empty dictionary and overall_feedback to \"Nice response, well done!\"\n- Focus on errors relevant to the student's skill level and practice areas\n- Provide alternative vocabulary that better fits the scenario context\n- Include brief explanations for vocabulary suggestions\n- Keep feedback in English for clarity\n\nWhen ending the conversation:\n- Set \"conversation_complete\" to true\n- Include a brief farewell appropriate to the scenario\n- Maintain the natural flow of the conversation while concluding\n- Provide final feedback as normal\n\nBegin the conversation by responding to the scenario context in Icelandic, introducing yourself or setting the scene as appropriate. Remember to stay in character and use only Icelandic in your initial response.\n\nAfter your initial response, wait for the student's input before continuing the conversation. Each time you receive a new input from the student, respond accordingly while following the guidelines above.\n\nHere is the scenario context provided by the student to begin the scenario:\n<scenario_context> {SCENARIO_CONTEXT} </scenario_context>"""

# Add the new system prompt for generating overall feedback
CONVERSATION_FEEDBACK_PROMPT = """You are an expert Icelandic language teacher evaluating a student's performance in a conversation practice session. Your task is to provide comprehensive feedback on their overall performance.

Here is the complete conversation history with individual feedback for each of the student's responses:

<conversation_history>
{CONVERSATION_HISTORY}
</conversation_history>

User Profile:
- Skill Level: {USER_SKILL_LEVEL}
- Profession: {USER_PROFESSION}
- Hobbies: {USER_HOBBIES}
- Interests: {USER_INTERESTS}
- Gender: {USER_GENDER}

Based on this conversation and the user's profile, please provide:

1. A summary of the overall performance
2. 3-5 main strengths demonstrated by the student
3. 3-5 key areas for improvement
4. An overall score out of 10 (where 10 is perfect fluency and accuracy)

CRITICAL INSTRUCTION: Your response MUST be ONLY a valid JSON object with EXACTLY this structure:
{
  "feedback_summary": "Replace this with your actual summary of the student's performance",
  "main_strengths": ["Replace with actual strength 1", "Replace with actual strength 2", "Replace with actual strength 3"],
  "areas_to_improve": ["Replace with actual area 1", "Replace with actual area 2", "Replace with actual area 3"],
  "overall_score": 0
}

EXTREMELY IMPORTANT:
- Your response MUST begin with the opening curly brace '{' with NO preceding characters, not even whitespace or newlines.
- Replace the placeholder text and values above with your actual feedback.
- The overall_score should be a number between 1 and 10, not a string.
- DO NOT include ANY text, explanations, or content outside of this JSON structure. 
- DO NOT include markdown formatting, code blocks, or any other non-JSON content.
- DO NOT include the word "json" or any other text before or after the JSON object.
- DO NOT add any newlines or spaces before the opening curly brace.
- DO NOT add newlines between JSON keys and values.
- DO NOT add newlines or spaces before any JSON key, especially "feedback_summary".
- ONLY return the raw JSON object itself.
- Ensure all JSON keys and values are properly quoted with double quotes.
- Ensure there are no trailing commas in arrays or objects.
- The entire response should be a single line with no line breaks.

Your response should start with an opening curly brace '{' and end with a closing curly brace '}'.
"""

# Add these new routes
@app.route('/start_conversation', methods=['POST'])
def start_conversation():
    data = request.get_json()
    user_id = data.get('user_id')
    scenario = data.get('scenario')

    try:
        # Get user profile from database
        user = session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        # Create a new conversation record
        new_conversation = Conversation(
            user_id=user_id,
            scenario=scenario
        )
        session.add(new_conversation)
        session.commit()

        # Create personalized system prompt using user profile
        personalized_prompt = CONVERSATION_SYSTEM_PROMPT.format(
            SCENARIO_CONTEXT=scenario,
            USER_SKILL_LEVEL=user.skill_level or "general",
            USER_PRACTICE_AREAS="conversation practice",
            USER_PROFESSION=user.profession or "general",
            USER_HOBBIES=user.hobbies or "general",
            USER_INTERESTS=user.interests or "general",
            USER_GENDER=user.gender or "general"
        )

        client = Anthropic(api_key=API_KEY)
        response = client.messages.create(
            model="claude-3-opus-20240229",
            max_tokens=1024,
            temperature=0.7,
            system=personalized_prompt,
            messages=[{
                "role": "user",
                "content": f"Scenario: {scenario}\nLet's begin our conversation."
            }]
        )
        
        try:
            response_json = json.loads(response.content[0].text)
            icelandic_text = response_json["response"]["icelandic_text"]
            english_translation = response_json["response"].get("english_translation", "")
            
            # Store the assistant message
            new_message = ConversationMessage(
                conversation_id=new_conversation.id,
                role="assistant",
                content=icelandic_text,
                feedback=json.dumps({"english_translation": english_translation})
            )
            session.add(new_message)
            
            return jsonify({
                "message": icelandic_text,
                "english_translation": english_translation,
                "conversation_id": new_conversation.id
            }), 200
        except json.JSONDecodeError:
            content = response.content[0].text
            
            # Store the assistant message
            new_message = ConversationMessage(
                conversation_id=new_conversation.id,
                role="assistant",
                content=content
            )
            session.add(new_message)
            session.commit()
            
            return jsonify({
                "message": content,
                "conversation_id": new_conversation.id,
                "english_translation": ""
            }), 200

    except Exception as e:
        print(f"Error in start_conversation: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_id = data.get('user_id')
    conversation_id = data.get('conversation_id')
    message = data.get('message')
    
    try:
        # Get the conversation
        conversation = session.query(Conversation).filter_by(id=conversation_id, user_id=user_id).first()
        if not conversation:
            return jsonify({"error": "Conversation not found"}), 404
            
        # Check if the conversation is already completed
        if conversation.completed_at:
            return jsonify({"error": "This conversation is already completed"}), 400
            
        # Add the user message to the database
        user_message = ConversationMessage(
            conversation_id=conversation_id,
            role="user",
            content=message
        )
        session.add(user_message)
        session.commit()
        
        # Get all messages in this conversation
        messages = session.query(ConversationMessage).filter_by(conversation_id=conversation_id).order_by(ConversationMessage.created_at).all()
        
        # Format the conversation history for the prompt
        conversation_history = ""
        for msg in messages:
            if msg.role == "user":
                conversation_history += f"Student: {msg.content}\n\n"
            else:
                conversation_history += f"Assistant: {msg.content}\n\n"
        
        # Get user information
        user = session.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        # Create the prompt
        personalized_prompt = CONVERSATION_SYSTEM_PROMPT.format(
            SCENARIO_CONTEXT=conversation.scenario,
            USER_SKILL_LEVEL=user.skill_level or "general",
            USER_PROFESSION=user.profession or "general",
            USER_HOBBIES=user.hobbies or "general",
            USER_INTERESTS=user.interests or "general",
            USER_GENDER=user.gender or "general",
            USER_PRACTICE_AREAS="general conversation"  # This could be customized in the future
        )
        
        # Call Claude API
        client = Anthropic(api_key=API_KEY)
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            temperature=0.7,
            system=personalized_prompt,
            messages=[
                {"role": "user", "content": conversation_history + f"Student: {message}"}
            ]
        )
        
        # Parse the response
        response_text = response.content[0].text
        
        # Try to extract JSON from the response
        try:
            # Find the JSON part of the response
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                response_json = json.loads(json_str)
                
                # Extract the components
                icelandic_text = response_json.get("response", {}).get("icelandic_text", "")
                english_translation = response_json.get("response", {}).get("english_translation", "")
                conversation_complete = response_json.get("response", {}).get("conversation_complete", False)
                grammar_notes = response_json.get("response", {}).get("grammar_notes", [])
                vocabulary_suggestions = response_json.get("response", {}).get("vocabulary_suggestions", {})
                overall_feedback = response_json.get("response", {}).get("overall_feedback", "")
                
                # Add the assistant message to the database
                assistant_message = ConversationMessage(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=icelandic_text
                )
                session.add(assistant_message)
                
                # Add feedback for the user's message
                feedback_json = {
                    "grammar_notes": grammar_notes,
                    "vocabulary_suggestions": vocabulary_suggestions,
                    "overall_feedback": overall_feedback
                }
                user_message.feedback = json.dumps(feedback_json)
                session.commit()
                
                # If the conversation is marked as complete by the LLM, mark it as completed
                if conversation_complete:
                    # Mark the conversation as completed
                    conversation.completed_at = func.now()
                    session.commit()
                    
                    # Generate feedback for the completed conversation
                    try:
                        # Call the generate_conversation_feedback endpoint
                        feedback_data = {
                            "user_id": user_id,
                            "conversation_id": conversation_id
                        }
                        # Make an internal request to generate feedback
                        with app.test_client() as client:
                            feedback_response = client.post(
                                '/generate_conversation_feedback',
                                json=feedback_data,
                                content_type='application/json'
                            )
                            feedback_result = json.loads(feedback_response.data)
                            logger.info(f"Generated feedback for completed conversation: {feedback_result}")
                    except Exception as feedback_err:
                        logger.error(f"Error generating feedback for completed conversation: {str(feedback_err)}")
                
                return jsonify({
                    "response": {
                        "icelandic_text": icelandic_text,
                        "english_translation": english_translation,
                        "grammar_notes": grammar_notes,
                        "vocabulary_suggestions": vocabulary_suggestions,
                        "overall_feedback": overall_feedback,
                        "conversation_complete": conversation_complete
                    },
                    "is_complete": conversation_complete
                }), 200
            else:
                # If no JSON found, use the raw text as the response
                logger.warning("No JSON found in Claude response, using raw text")
                
                # Add the assistant message to the database
                assistant_message = ConversationMessage(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=response_text
                )
                session.add(assistant_message)
                session.commit()
                
                return jsonify({
                    "response": {
                        "icelandic_text": response_text,
                        "english_translation": "",
                        "grammar_notes": [],
                        "vocabulary_suggestions": {},
                        "overall_feedback": "",
                        "conversation_complete": False
                    },
                    "is_complete": False
                }), 200
                
        except Exception as json_err:
            logger.error(f"Error parsing Claude response as JSON: {str(json_err)}")
            
            # Add the assistant message to the database
            assistant_message = ConversationMessage(
                conversation_id=conversation_id,
                role="assistant",
                content=response_text
            )
            session.add(assistant_message)
            session.commit()
            
            return jsonify({
                "response": {
                    "icelandic_text": response_text,
                    "english_translation": "",
                    "grammar_notes": [],
                    "vocabulary_suggestions": {},
                    "overall_feedback": "",
                    "conversation_complete": False
                },
                "is_complete": False
            }), 200

    except Exception as e:
        print(f"Error in chat: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/generate_conversation_feedback', methods=['POST'])
def generate_conversation_feedback():
    data = request.get_json()
    user_id = data.get('user_id')
    conversation_id = data.get('conversation_id')
    
    # Log the incoming request data
    logger.info(f"Received feedback generation request: user_id={user_id}, conversation_id={conversation_id}")
    
    try:
        # Get the conversation from the database
        conversation = session.query(Conversation).filter_by(id=conversation_id, user_id=user_id).first()
        if not conversation:
            logger.error(f"Conversation not found: user_id={user_id}, conversation_id={conversation_id}")
            return jsonify({"error": "Conversation not found"}), 404
            
        # Check if feedback already exists
        if conversation.overall_feedback:
            logger.info(f"Feedback already exists for conversation {conversation_id}, returning existing feedback")
            return jsonify({
                "feedback_summary": conversation.overall_feedback,
                "main_strengths": json.loads(conversation.main_strengths) if conversation.main_strengths else [],
                "areas_to_improve": json.loads(conversation.areas_to_improve) if conversation.areas_to_improve else [],
                "overall_score": conversation.overall_score,
                "conversation_id": conversation_id,
                "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None
            }), 200
            
        # Get all messages in this conversation
        messages = session.query(ConversationMessage).filter_by(conversation_id=conversation_id).order_by(ConversationMessage.created_at).all()
        
        # Format the conversation history for the prompt
        conversation_history = ""
        for i, msg in enumerate(messages):
            if msg.role == "user":
                conversation_history += f"Student: {msg.content}\n"
                # Add feedback if available
                if msg.feedback:
                    feedback_json = json.loads(msg.feedback)
                    conversation_history += "Feedback:\n"
                    if feedback_json.get("grammar_notes"):
                        conversation_history += "Grammar notes: " + ", ".join(feedback_json["grammar_notes"]) + "\n"
                    if feedback_json.get("vocabulary_suggestions"):
                        conversation_history += "Vocabulary suggestions: " + ", ".join([f"{k}: {v}" for k, v in feedback_json["vocabulary_suggestions"].items()]) + "\n"
                    if feedback_json.get("overall_feedback"):
                        conversation_history += f"Overall: {feedback_json['overall_feedback']}\n"
            else:
                conversation_history += f"Assistant: {msg.content}\n"
            conversation_history += "\n"
        
        # Get user information
        user = session.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        # Create the prompt
        personalized_prompt = CONVERSATION_FEEDBACK_PROMPT.format(
            CONVERSATION_HISTORY=conversation_history,
            USER_SKILL_LEVEL=user.skill_level or "general",
            USER_PROFESSION=user.profession or "general",
            USER_HOBBIES=user.hobbies or "general",
            USER_INTERESTS=user.interests or "general",
            USER_GENDER=user.gender or "general"
        )
        
        # Log the complete prompt being sent to Claude
        logger.info(f"COMPLETE PROMPT SENT TO CLAUDE FOR CONVERSATION {conversation_id}:\n{personalized_prompt}")
        
        # Call Claude API
        client = Anthropic(api_key=API_KEY)
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            temperature=0.3,
            system=personalized_prompt,
            messages=[{
                "role": "user",
                "content": "Please provide overall feedback for this conversation. You MUST return ONLY a valid JSON object with NO NEWLINES or EXTRA SPACES between keys and values. The JSON must start with '{' and end with '}'. Do not include any text, explanations, or content outside of the JSON structure. The JSON should have this exact format: {\"feedback_summary\":\"text\",\"main_strengths\":[\"item1\",\"item2\",\"item3\"],\"areas_to_improve\":[\"item1\",\"item2\",\"item3\"],\"overall_score\":number}"
            }]
        )
        
        # Parse the response
        try:
            # Get the raw text from the response and clean it
            raw_response_text = response.content[0].text
            logger.info(f"COMPLETE FEEDBACK RESPONSE from Claude for conversation {conversation_id}:\n{raw_response_text}")
            
            # Trim the response to remove any leading/trailing whitespace
            response_text = raw_response_text.strip()
            logger.info(f"TRIMMED RESPONSE: {response_text}")
            
            # Create a fallback feedback response in case parsing fails
            fallback_feedback = {
                "feedback_summary": "We couldn't generate detailed feedback for this conversation. However, you've completed the conversation practice successfully.",
                "main_strengths": ["Participation in Icelandic conversation practice"],
                "areas_to_improve": ["Continue practicing with more conversations"],
                "overall_score": 5
            }
            
            # More aggressive cleaning of the JSON string
            # First, find the JSON object boundaries
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                # Extract just the JSON part
                json_str = response_text[json_start:json_end]
                
                # Comprehensive cleaning of the JSON string
                # 1. Remove all newlines and replace with spaces
                cleaned_json = json_str.replace('\n', ' ')
                
                # 2. Fix spacing around keys and values
                cleaned_json = re.sub(r'\s+', ' ', cleaned_json)  # Normalize all whitespace
                cleaned_json = re.sub(r'"\s+:', '\":', cleaned_json)  # Remove space between key and colon
                cleaned_json = re.sub(r':\s+', ': ', cleaned_json)  # Normalize space after colon
                cleaned_json = re.sub(r',\s+', ', ', cleaned_json)  # Normalize space after comma
                
                # 3. Fix any trailing commas
                cleaned_json = re.sub(r',\s*}', '}', cleaned_json)
                cleaned_json = re.sub(r',\s*]', ']', cleaned_json)
                
                logger.info(f"Thoroughly cleaned JSON string: {cleaned_json}")
                
                try:
                    # Try to parse the cleaned JSON
                    feedback_json = json.loads(cleaned_json)
                    logger.info(f"Successfully parsed JSON after thorough cleaning: {feedback_json}")
                except json.JSONDecodeError as e:
                    logger.error(f"JSON parsing still failed after thorough cleaning: {str(e)}")
                    # Fall back to the original approaches
                    feedback_json = None
            else:
                logger.error(f"Could not find valid JSON object boundaries in response: {response_text}")
                feedback_json = None
            
            # If the thorough cleaning approach failed, try the original approaches
            if not feedback_json:
                # Handle the specific error case with newline character
                if response_text.startswith('\n'):
                    logger.info("Response starts with newline, removing it")
                    response_text = response_text.lstrip()
                
                # Additional check for common error pattern with newline before "feedback_summary"
                if '\n"feedback_summary"' in response_text:
                    logger.info("Found newline before feedback_summary, attempting to fix")
                    response_text = response_text.replace('\n"feedback_summary"', '"feedback_summary"')
                
                # Try different approaches to extract valid JSON
                
                # Approach 1: Find JSON between curly braces
                json_start = response_text.find('{')
                json_end = response_text.rfind('}') + 1
                
                logger.info(f"JSON extraction - Start index: {json_start}, End index: {json_end}")
                
                # Special handling for the specific error case with newlines in JSON
                if json_start >= 0 and json_end > json_start:
                    json_str = response_text[json_start:json_end]
                    
                    # Check for newlines inside the JSON that might be causing issues
                    if '\n' in json_str:
                        logger.info("Found newlines inside JSON, attempting to clean")
                        # Replace newlines inside the JSON with spaces
                        cleaned_json_str = json_str.replace('\n', ' ')
                        # Fix common issues with newlines before keys
                        cleaned_json_str = re.sub(r'\s+"([^"]+)":', r'"\1":', cleaned_json_str)
                        logger.info(f"Cleaned JSON string: {cleaned_json_str}")
                        
                        try:
                            feedback_json = json.loads(cleaned_json_str)
                            logger.info(f"Successfully parsed JSON after newline cleaning: {feedback_json}")
                        except json.JSONDecodeError:
                            # If cleaning didn't work, continue with the original approaches
                            logger.info("Newline cleaning didn't work, continuing with original approaches")
                            json_str = response_text[json_start:json_end]
                    else:
                        json_str = response_text[json_start:json_end]
                    
                    try:
                        logger.info(f"Attempting to parse JSON string (Approach 1): {json_str}")
                        feedback_json = json.loads(json_str)
                        logger.info(f"Successfully parsed JSON using approach 1: {feedback_json}")
                    except json.JSONDecodeError as json_err:
                        # If that fails, try approach 2
                        logger.info(f"Approach 1 failed with error: {str(json_err)}")
                        
                        # Approach 2: Try to clean the JSON string
                        try:
                            # Remove any leading/trailing whitespace or quotes
                            json_str = json_str.strip().strip('"\'')
                            
                            # Replace escaped quotes
                            json_str = json_str.replace('\\"', '"')
                            
                            # Fix unescaped quotes in strings
                            json_str = re.sub(r'(?<!")(".*?[^\\]")(?!")', r'\1', json_str)
                            
                            # Fix trailing commas
                            json_str = re.sub(r',\s*}', '}', json_str)
                            json_str = re.sub(r',\s*]', ']', json_str)
                            
                            logger.info(f"Cleaned JSON string (Approach 2): {json_str}")
                            feedback_json = json.loads(json_str)
                            logger.info(f"Successfully parsed JSON using approach 2: {feedback_json}")
                        except json.JSONDecodeError as json_err2:
                            logger.info(f"Approach 2 failed with error: {str(json_err2)}")
            
            # If all approaches failed, use fallback
            if not feedback_json:
                logger.error("All JSON parsing approaches failed, using fallback")
                feedback_json = fallback_feedback
            
            # Ensure all required fields exist
            if "feedback_summary" not in feedback_json or not feedback_json["feedback_summary"]:
                feedback_json["feedback_summary"] = fallback_feedback["feedback_summary"]
            if "main_strengths" not in feedback_json or not isinstance(feedback_json["main_strengths"], list) or not feedback_json["main_strengths"]:
                feedback_json["main_strengths"] = fallback_feedback["main_strengths"]
            if "areas_to_improve" not in feedback_json or not isinstance(feedback_json["areas_to_improve"], list) or not feedback_json["areas_to_improve"]:
                feedback_json["areas_to_improve"] = fallback_feedback["areas_to_improve"]
            if "overall_score" not in feedback_json or not isinstance(feedback_json["overall_score"], int):
                feedback_json["overall_score"] = fallback_feedback["overall_score"]
                
            # Update the conversation record with the feedback
            try:
                # Validate that the JSON can be serialized and deserialized properly
                main_strengths_json = json.dumps(feedback_json["main_strengths"])
                areas_to_improve_json = json.dumps(feedback_json["areas_to_improve"])
                
                # Test that we can deserialize it
                json.loads(main_strengths_json)
                json.loads(areas_to_improve_json)
                
                # If we get here, the JSON is valid
                conversation.overall_feedback = feedback_json["feedback_summary"]
                conversation.main_strengths = main_strengths_json
                conversation.areas_to_improve = areas_to_improve_json
                conversation.overall_score = feedback_json["overall_score"]
                
                session.commit()
                logger.info(f"Successfully updated conversation {conversation_id} with feedback")
                
                return jsonify({
                    "feedback_summary": feedback_json["feedback_summary"],
                    "main_strengths": feedback_json["main_strengths"],
                    "areas_to_improve": feedback_json["areas_to_improve"],
                    "overall_score": feedback_json["overall_score"],
                    "conversation_id": conversation_id,
                    "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None
                }), 200
            except Exception as e:
                session.rollback()
                logger.error(f"Error updating conversation with feedback: {str(e)}")
                return jsonify({"error": f"Error saving feedback: {str(e)}"}), 500
            
        except Exception as e:
            logger.error(f"Error processing Claude response: {str(e)}")
            
            # Create a fallback feedback response
            fallback_feedback = {
                "feedback_summary": "We couldn't generate detailed feedback for this conversation. However, you've completed the conversation practice successfully.",
                "main_strengths": ["Participation in Icelandic conversation practice"],
                "areas_to_improve": ["Continue practicing with more conversations"],
                "overall_score": 5
            }
            
            # Update the conversation record with the fallback feedback
            conversation.overall_feedback = fallback_feedback["feedback_summary"]
            conversation.main_strengths = json.dumps(fallback_feedback["main_strengths"])
            conversation.areas_to_improve = json.dumps(fallback_feedback["areas_to_improve"])
            conversation.overall_score = fallback_feedback["overall_score"]
            session.commit()
            
            return jsonify(fallback_feedback), 200
            
    except Exception as e:
        logger.error(f"Error in generate_conversation_feedback: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/end_conversation', methods=['POST'])
def end_conversation():
    data = request.get_json()
    user_id = data.get('user_id')
    conversation_id = data.get('conversation_id')
    
    try:
        # Get the conversation
        conversation = session.query(Conversation).filter_by(id=conversation_id, user_id=user_id).first()
        if not conversation:
            return jsonify({"error": "Conversation not found"}), 404
            
        # Check if the conversation is already completed
        if conversation.completed_at:
            # If feedback already exists, return it
            if conversation.overall_feedback:
                return jsonify({
                    "feedback_summary": conversation.overall_feedback,
                    "main_strengths": json.loads(conversation.main_strengths) if conversation.main_strengths else [],
                    "areas_to_improve": json.loads(conversation.areas_to_improve) if conversation.areas_to_improve else [],
                    "overall_score": conversation.overall_score,
                    "conversation_id": conversation_id,
                    "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None
                }), 200
        
        # Mark the conversation as completed
        conversation.completed_at = func.now()
        session.commit()
        
        # Create a fallback feedback response in case of errors
        fallback_feedback = {
            "feedback_summary": "We couldn't generate detailed feedback for this conversation. However, you've completed the conversation practice successfully.",
            "main_strengths": ["Participation in Icelandic conversation practice"],
            "areas_to_improve": ["Continue practicing with more conversations"],
            "overall_score": 5
        }
        
        try:
            # Get all messages in this conversation
            messages = session.query(ConversationMessage).filter_by(conversation_id=conversation_id).order_by(ConversationMessage.created_at).all()
            
            # Format the conversation history for the prompt
            conversation_history = ""
            for i, msg in enumerate(messages):
                if msg.role == "user":
                    conversation_history += f"Student: {msg.content}\n"
                    # Add feedback if available
                    if msg.feedback:
                        feedback_json = json.loads(msg.feedback)
                        conversation_history += "Feedback:\n"
                        if feedback_json.get("grammar_notes"):
                            conversation_history += "Grammar notes: " + ", ".join(feedback_json["grammar_notes"]) + "\n"
                        if feedback_json.get("vocabulary_suggestions"):
                            conversation_history += "Vocabulary suggestions: " + ", ".join([f"{k}: {v}" for k, v in feedback_json["vocabulary_suggestions"].items()]) + "\n"
                        if feedback_json.get("overall_feedback"):
                            conversation_history += f"Overall: {feedback_json['overall_feedback']}\n"
                    conversation_history += "\n"
                else:
                    conversation_history += f"Assistant: {msg.content}\n\n"
            
            # Get user information
            user = session.query(User).filter_by(id=user_id).first()
            if not user:
                # Use fallback if user not found
                conversation.overall_feedback = fallback_feedback["feedback_summary"]
                conversation.main_strengths = json.dumps(fallback_feedback["main_strengths"])
                conversation.areas_to_improve = json.dumps(fallback_feedback["areas_to_improve"])
                conversation.overall_score = fallback_feedback["overall_score"]
                session.commit()
                return jsonify(fallback_feedback), 200
                
            # Create the prompt
            personalized_prompt = CONVERSATION_FEEDBACK_PROMPT.format(
                CONVERSATION_HISTORY=conversation_history,
                USER_SKILL_LEVEL=user.skill_level or "general",
                USER_PROFESSION=user.profession or "general",
                USER_HOBBIES=user.hobbies or "general",
                USER_INTERESTS=user.interests or "general",
                USER_GENDER=user.gender or "general"
            )
            
            # Log the prompt we're sending to Claude
            logger.info(f"Sending FEEDBACK prompt to Claude for conversation {conversation_id}:\n{personalized_prompt[:500]}...")
            
            # Call Claude API
            client = Anthropic(api_key=API_KEY)
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1024,
                temperature=0.3,
                system=personalized_prompt,
                messages=[{
                    "role": "user",
                    "content": "Please provide overall feedback for this conversation. Remember to return ONLY a valid JSON object with no newlines, starting with '{' and ending with '}'. Do not include any text, explanations, or content outside of the JSON structure."
                }]
            )
            
            # Get the raw text from the response and clean it
            raw_response_text = response.content[0].text
            logger.info(f"COMPLETE FEEDBACK RESPONSE from Claude for conversation {conversation_id}:\n{raw_response_text}")
            
            # Trim the response to remove any leading/trailing whitespace
            response_text = raw_response_text.strip()
            logger.info(f"TRIMMED RESPONSE: {response_text}")
            
            # Handle the specific error case with newline character
            if response_text.startswith('\n'):
                logger.info("Response starts with newline, removing it")
                response_text = response_text.lstrip()
            
            # Additional check for common error pattern with newline before "feedback_summary"
            if '\n"feedback_summary"' in response_text:
                logger.info("Found newline before feedback_summary, attempting to fix")
                response_text = response_text.replace('\n"feedback_summary"', '"feedback_summary"')
            
            # Try different approaches to extract valid JSON
            feedback_json = None
            
            # Approach 1: Find JSON between curly braces
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            
            logger.info(f"JSON extraction - Start index: {json_start}, End index: {json_end}")
            
            # Special handling for the specific error case with newlines in JSON
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                
                # Check for newlines inside the JSON that might be causing issues
                if '\n' in json_str:
                    logger.info("Found newlines inside JSON, attempting to clean")
                    # Replace newlines inside the JSON with spaces
                    cleaned_json_str = json_str.replace('\n', ' ')
                    # Fix common issues with newlines before keys
                    cleaned_json_str = re.sub(r'\s+"([^"]+)":', r'"\1":', cleaned_json_str)
                    logger.info(f"Cleaned JSON string: {cleaned_json_str}")
                    
                    try:
                        feedback_json = json.loads(cleaned_json_str)
                        logger.info(f"Successfully parsed JSON after newline cleaning: {feedback_json}")
                    except json.JSONDecodeError:
                        # If cleaning didn't work, continue with the original approaches
                        logger.info("Newline cleaning didn't work, continuing with original approaches")
                
                if not feedback_json:
                    try:
                        logger.info(f"Attempting to parse JSON string (Approach 1): {json_str}")
                        feedback_json = json.loads(json_str)
                        logger.info(f"Successfully parsed JSON using approach 1: {feedback_json}")
                    except json.JSONDecodeError as json_err:
                        logger.info(f"Approach 1 failed with error: {str(json_err)}")
                        
                        # Approach 2: Try to clean the JSON string
                        try:
                            # Remove any leading/trailing whitespace or quotes
                            json_str = json_str.strip().strip('"\'')
                            
                            # Replace escaped quotes
                            json_str = json_str.replace('\\"', '"')
                            
                            # Fix unescaped quotes in strings
                            json_str = re.sub(r'(?<!")(".*?[^\\]")(?!")', r'\1', json_str)
                            
                            # Fix trailing commas
                            json_str = re.sub(r',\s*}', '}', json_str)
                            json_str = re.sub(r',\s*]', ']', json_str)
                            
                            logger.info(f"Cleaned JSON string (Approach 2): {json_str}")
                            feedback_json = json.loads(json_str)
                            logger.info(f"Successfully parsed JSON using approach 2: {feedback_json}")
                        except json.JSONDecodeError as json_err2:
                            logger.info(f"Approach 2 failed with error: {str(json_err2)}")
            
            # If all approaches failed, use fallback
            if not feedback_json:
                logger.error("All JSON parsing approaches failed, using fallback")
                feedback_json = fallback_feedback
            
            # Ensure all required fields exist
            if "feedback_summary" not in feedback_json or not feedback_json["feedback_summary"]:
                feedback_json["feedback_summary"] = fallback_feedback["feedback_summary"]
            if "main_strengths" not in feedback_json or not isinstance(feedback_json["main_strengths"], list) or not feedback_json["main_strengths"]:
                feedback_json["main_strengths"] = fallback_feedback["main_strengths"]
            if "areas_to_improve" not in feedback_json or not isinstance(feedback_json["areas_to_improve"], list) or not feedback_json["areas_to_improve"]:
                feedback_json["areas_to_improve"] = fallback_feedback["areas_to_improve"]
            if "overall_score" not in feedback_json or not isinstance(feedback_json["overall_score"], int):
                feedback_json["overall_score"] = fallback_feedback["overall_score"]
                
            # Update the conversation record with the feedback
            try:
                # Validate that the JSON can be serialized and deserialized properly
                main_strengths_json = json.dumps(feedback_json["main_strengths"])
                areas_to_improve_json = json.dumps(feedback_json["areas_to_improve"])
                
                # Test that we can deserialize it
                json.loads(main_strengths_json)
                json.loads(areas_to_improve_json)
                
                # If we get here, the JSON is valid
                conversation.overall_feedback = feedback_json["feedback_summary"]
                conversation.main_strengths = main_strengths_json
                conversation.areas_to_improve = areas_to_improve_json
                conversation.overall_score = feedback_json["overall_score"]
                
                session.commit()
                logger.info(f"Successfully updated conversation {conversation_id} with feedback")
                
                return jsonify({
                    "feedback_summary": feedback_json["feedback_summary"],
                    "main_strengths": feedback_json["main_strengths"],
                    "areas_to_improve": feedback_json["areas_to_improve"],
                    "overall_score": feedback_json["overall_score"],
                    "conversation_id": conversation_id,
                    "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None
                }), 200
            except Exception as e:
                session.rollback()
                logger.error(f"Error updating conversation with feedback: {str(e)}")
                return jsonify({"error": f"Error saving feedback: {str(e)}"}), 500
            
        except Exception as inner_e:
            logger.error(f"Error processing Claude response: {str(inner_e)}")
            
            # Update the conversation record with the fallback feedback
            conversation.overall_feedback = fallback_feedback["feedback_summary"]
            conversation.main_strengths = json.dumps(fallback_feedback["main_strengths"])
            conversation.areas_to_improve = json.dumps(fallback_feedback["areas_to_improve"])
            conversation.overall_score = fallback_feedback["overall_score"]
            session.commit()
            
            return jsonify(fallback_feedback), 200
            
    except Exception as e:
        logger.error(f"Error in end_conversation: {str(e)}")
        
        # Check if this is the specific error with newlines in JSON
        error_str = str(e)
        if '\n' in error_str and 'feedback_summary' in error_str:
            logger.info("Detected specific error with newlines in JSON, using fallback feedback")
            
            # Create a fallback feedback response
            fallback_feedback = {
                "feedback_summary": "We couldn't generate detailed feedback for this conversation. However, you've completed the conversation practice successfully.",
                "main_strengths": ["Participation in Icelandic conversation practice"],
                "areas_to_improve": ["Continue practicing with more conversations"],
                "overall_score": 5
            }
            
            # Update the conversation record with the fallback feedback
            conversation.overall_feedback = fallback_feedback["feedback_summary"]
            conversation.main_strengths = json.dumps(fallback_feedback["main_strengths"])
            conversation.areas_to_improve = json.dumps(fallback_feedback["areas_to_improve"])
            conversation.overall_score = fallback_feedback["overall_score"]
            session.commit()
            
            return jsonify({
                "feedback_summary": fallback_feedback["feedback_summary"],
                "main_strengths": fallback_feedback["main_strengths"],
                "areas_to_improve": fallback_feedback["areas_to_improve"],
                "overall_score": fallback_feedback["overall_score"],
                "conversation_id": conversation_id,
                "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None
            }), 200
        
        return jsonify({"error": str(e)}), 500

@app.route('/users/<int:user_id>/learning_profile', methods=['GET'])
def get_user_learning_profile(user_id):
    try:
        # Get the user
        user = session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        # Get all completed conversations for this user
        conversations = session.query(Conversation).filter(
            Conversation.user_id == user_id, 
            Conversation.completed_at != None
        ).order_by(Conversation.completed_at.desc()).all()
        
        # Format the response
        learning_profile = {
            "user_info": {
                "email": user.email,
                "profession": user.profession,
                "hobbies": user.hobbies,
                "interests": user.interests,
                "skill_level": user.skill_level,
                "gender": user.gender
            },
            "conversation_history": []
        }
        
        # Add conversation feedback
        for conversation in conversations:
            if conversation.overall_feedback:
                learning_profile["conversation_history"].append({
                    "conversation_id": conversation.id,
                    "scenario": conversation.scenario,
                    "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None,
                    "feedback_summary": conversation.overall_feedback,
                    "main_strengths": json.loads(conversation.main_strengths) if conversation.main_strengths else [],
                    "areas_to_improve": json.loads(conversation.areas_to_improve) if conversation.areas_to_improve else [],
                    "overall_score": conversation.overall_score
                })
        
        return jsonify(learning_profile), 200
            
    except Exception as e:
        print(f"Error in get_user_learning_profile: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/conversations/<int:conversation_id>/feedback', methods=['GET'])
def get_conversation_feedback(conversation_id):
    try:
        # Get the conversation
        conversation = session.query(Conversation).filter_by(id=conversation_id).first()
        if not conversation:
            logger.error(f"Conversation not found: {conversation_id}")
            return jsonify({"error": "Conversation not found"}), 404
            
        # Check if feedback exists
        if conversation.overall_feedback:
            try:
                # Return the existing feedback
                return jsonify({
                    "feedback_summary": conversation.overall_feedback,
                    "main_strengths": json.loads(conversation.main_strengths) if conversation.main_strengths else [],
                    "areas_to_improve": json.loads(conversation.areas_to_improve) if conversation.areas_to_improve else [],
                    "overall_score": conversation.overall_score,
                    "conversation_id": conversation_id,
                    "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None
                }), 200
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error when retrieving feedback: {str(e)}")
                # If there's an issue with the stored JSON, return a clear error
                return jsonify({
                    "error": f"JSON parsing error in stored feedback: {str(e)}",
                    "conversation_id": conversation_id
                }), 500
            
        # If the conversation is completed but has no feedback, generate it now
        if conversation.completed_at:
            logger.info(f"Conversation {conversation_id} is completed but has no feedback. Generating feedback now.")
            
            # Get all messages in this conversation
            messages = session.query(ConversationMessage).filter_by(conversation_id=conversation_id).order_by(ConversationMessage.created_at).all()
            
            # Format the conversation history for the prompt
            conversation_history = ""
            for i, msg in enumerate(messages):
                if msg.role == "user":
                    conversation_history += f"Student: {msg.content}\n"
                    # Add feedback if available
                    if msg.feedback:
                        feedback_json = json.loads(msg.feedback)
                        conversation_history += "Feedback:\n"
                        if feedback_json.get("grammar_notes"):
                            conversation_history += "Grammar notes: " + ", ".join(feedback_json["grammar_notes"]) + "\n"
                        if feedback_json.get("vocabulary_suggestions"):
                            conversation_history += "Vocabulary suggestions: " + ", ".join([f"{k}: {v}" for k, v in feedback_json["vocabulary_suggestions"].items()]) + "\n"
                        if feedback_json.get("overall_feedback"):
                            conversation_history += f"Overall: {feedback_json['overall_feedback']}\n"
                else:
                    conversation_history += f"Assistant: {msg.content}\n"
                conversation_history += "\n"
            
            # Get user information
            user = session.query(User).filter_by(id=conversation.user_id).first()
            if not user:
                return jsonify({"error": "User not found"}), 404
                
            # Create the prompt
            personalized_prompt = CONVERSATION_FEEDBACK_PROMPT.format(
                CONVERSATION_HISTORY=conversation_history,
                USER_SKILL_LEVEL=user.skill_level or "general",
                USER_PROFESSION=user.profession or "general",
                USER_HOBBIES=user.hobbies or "general",
                USER_INTERESTS=user.interests or "general",
                USER_GENDER=user.gender or "general"
            )
            
            # Log the prompt we're sending to Claude
            logger.info(f"Sending FEEDBACK prompt to Claude for conversation {conversation_id}:\n{personalized_prompt[:500]}...")
            
            # Call Claude API
            client = Anthropic(api_key=API_KEY)
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1024,
                temperature=0.3,
                system=personalized_prompt,
                messages=[{
                    "role": "user",
                    "content": "Please provide overall feedback for this conversation. Remember to return ONLY a valid JSON object with no newlines, starting with '{' and ending with '}'. Do not include any text, explanations, or content outside of the JSON structure."
                }]
            )
            
            # Parse the response
            try:
                # Get the raw text from the response and clean it
                raw_response_text = response.content[0].text
                logger.info(f"Raw response from Claude: {raw_response_text[:200]}...")
                
                # Create a fallback feedback response in case parsing fails
                fallback_feedback = {
                    "feedback_summary": "We couldn't generate detailed feedback for this conversation. However, you've completed the conversation practice successfully.",
                    "main_strengths": ["Participation in Icelandic conversation practice"],
                    "areas_to_improve": ["Continue practicing with more conversations"],
                    "overall_score": 5
                }
                
                # Handle the specific error case with newline character
                if raw_response_text.startswith('\n'):
                    logger.info("Response starts with newline, removing it")
                    raw_response_text = raw_response_text.lstrip()
                
                # Additional check for common error pattern with newline before "feedback_summary"
                if '\n"feedback_summary"' in raw_response_text:
                    logger.info("Found newline before feedback_summary, attempting to fix")
                    raw_response_text = raw_response_text.replace('\n"feedback_summary"', '"feedback_summary"')
                    
                # Try different approaches to extract valid JSON
                
                # Approach 1: Find JSON between curly braces
                json_start = raw_response_text.find('{')
                json_end = raw_response_text.rfind('}') + 1
                
                logger.info(f"JSON extraction - Start index: {json_start}, End index: {json_end}")
                
                # Special handling for the specific error case with newlines in JSON
                if json_start >= 0 and json_end > json_start:
                    json_str = raw_response_text[json_start:json_end]
                    
                    # Check for newlines inside the JSON that might be causing issues
                    if '\n' in json_str:
                        logger.info("Found newlines inside JSON, attempting to clean")
                        # Replace newlines inside the JSON with spaces
                        cleaned_json_str = json_str.replace('\n', ' ')
                        # Fix common issues with newlines before keys
                        cleaned_json_str = re.sub(r'\s+"([^"]+)":', r'"\1":', cleaned_json_str)
                        logger.info(f"Cleaned JSON string: {cleaned_json_str}")
                        
                        try:
                            feedback_json = json.loads(cleaned_json_str)
                            logger.info(f"Successfully parsed JSON after newline cleaning: {feedback_json}")
                        except json.JSONDecodeError:
                            # If cleaning didn't work, continue with the original approaches
                            logger.info("Newline cleaning didn't work, continuing with original approaches")
                            json_str = raw_response_text[json_start:json_end]
                    else:
                        json_str = raw_response_text[json_start:json_end]
                    
                    try:
                        logger.info(f"Attempting to parse JSON string (Approach 1): {json_str}")
                        feedback_json = json.loads(json_str)
                        logger.info(f"Successfully parsed JSON using approach 1: {feedback_json}")
                    except json.JSONDecodeError as json_err:
                        # If that fails, try approach 2
                        logger.info(f"Approach 1 failed with error: {str(json_err)}")
                        
                        # Approach 2: Try to clean the JSON string
                        try:
                            # Remove any leading/trailing whitespace or quotes
                            json_str = json_str.strip().strip('"\'')
                            
                            # Replace escaped quotes
                            json_str = json_str.replace('\\"', '"')
                            
                            # Fix unescaped quotes in strings
                            json_str = re.sub(r'(?<!")(".*?[^\\]")(?!")', r'\1', json_str)
                            
                            # Fix trailing commas
                            json_str = re.sub(r',\s*}', '}', json_str)
                            json_str = re.sub(r',\s*]', ']', json_str)
                            
                            logger.info(f"Cleaned JSON string (Approach 2): {json_str}")
                            feedback_json = json.loads(json_str)
                            logger.info(f"Successfully parsed JSON using approach 2: {feedback_json}")
                        except json.JSONDecodeError as json_err2:
                            # If that fails, try approach 3
                            logger.info(f"Approach 2 failed with error: {str(json_err2)}")
                            
                            # Approach 3: Try to manually construct the JSON
                            try:
                                # Extract key components using regex
                                summary_match = re.search(r'"feedback_summary"\s*:\s*"((?:[^"\\]|\\"|\\\\)*)"', raw_response_text, re.DOTALL)
                                strengths_match = re.search(r'"main_strengths"\s*:\s*\[(.*?)\]', raw_response_text, re.DOTALL)
                                areas_match = re.search(r'"areas_to_improve"\s*:\s*\[(.*?)\]', raw_response_text, re.DOTALL)
                                score_match = re.search(r'"overall_score"\s*:\s*(\d+)', raw_response_text)
                                
                                logger.info(f"Regex matches - Summary: {bool(summary_match)}, Strengths: {bool(strengths_match)}, Areas: {bool(areas_match)}, Score: {bool(score_match)}")
                                
                                if summary_match:
                                    # Unescape any escaped quotes in the summary
                                    summary = summary_match.group(1).replace('\\"', '"')
                                    logger.info(f"Extracted summary: {summary}")
                                    
                                    feedback_json = {
                                        "feedback_summary": summary,
                                        "main_strengths": [],
                                        "areas_to_improve": [],
                                        "overall_score": int(score_match.group(1)) if score_match else 5
                                    }
                                    
                                    # Process strengths
                                    if strengths_match:
                                        strengths_text = strengths_match.group(1)
                                        logger.info(f"Raw strengths text: {strengths_text}")
                                        strengths = re.findall(r'"([^"]*)"', strengths_text)
                                        logger.info(f"Extracted strengths: {strengths}")
                                        feedback_json["main_strengths"] = strengths
                                    
                                    # Process areas to improve
                                    if areas_match:
                                        areas_text = areas_match.group(1)
                                        logger.info(f"Raw areas text: {areas_text}")
                                        areas = re.findall(r'"([^"]*)"', areas_text)
                                        logger.info(f"Extracted areas: {areas}")
                                        feedback_json["areas_to_improve"] = areas
                                        
                                    logger.info(f"Successfully parsed JSON using approach 3: {feedback_json}")
                                else:
                                    # If regex fails, use fallback
                                    logger.error("Approach 3 failed, using fallback")
                                    feedback_json = fallback_feedback
                            except Exception as e:
                                logger.error(f"Approach 3 failed with error: {str(e)}")
                                feedback_json = fallback_feedback
                else:
                    # No JSON structure found, use fallback
                    logger.error("No JSON structure found in response")
                    feedback_json = fallback_feedback
                
                # Ensure all required fields exist
                if "feedback_summary" not in feedback_json or not feedback_json["feedback_summary"]:
                    feedback_json["feedback_summary"] = fallback_feedback["feedback_summary"]
                if "main_strengths" not in feedback_json or not isinstance(feedback_json["main_strengths"], list) or not feedback_json["main_strengths"]:
                    feedback_json["main_strengths"] = fallback_feedback["main_strengths"]
                if "areas_to_improve" not in feedback_json or not isinstance(feedback_json["areas_to_improve"], list) or not feedback_json["areas_to_improve"]:
                    feedback_json["areas_to_improve"] = fallback_feedback["areas_to_improve"]
                if "overall_score" not in feedback_json or not isinstance(feedback_json["overall_score"], int):
                    feedback_json["overall_score"] = fallback_feedback["overall_score"]
                    
                # Update the conversation record with the feedback
                try:
                    # Validate that the JSON can be serialized and deserialized properly
                    main_strengths_json = json.dumps(feedback_json["main_strengths"])
                    areas_to_improve_json = json.dumps(feedback_json["areas_to_improve"])
                    
                    # Test that we can deserialize it
                    json.loads(main_strengths_json)
                    json.loads(areas_to_improve_json)
                    
                    # If we get here, the JSON is valid
                    conversation.overall_feedback = feedback_json["feedback_summary"]
                    conversation.main_strengths = main_strengths_json
                    conversation.areas_to_improve = areas_to_improve_json
                    conversation.overall_score = feedback_json["overall_score"]
                    
                    session.commit()
                    logger.info(f"Successfully updated conversation {conversation_id} with feedback")
                    
                    return jsonify({
                        "feedback_summary": feedback_json["feedback_summary"],
                        "main_strengths": feedback_json["main_strengths"],
                        "areas_to_improve": feedback_json["areas_to_improve"],
                        "overall_score": feedback_json["overall_score"],
                        "conversation_id": conversation_id,
                        "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None
                    }), 200
                except Exception as e:
                    session.rollback()
                    logger.error(f"Error updating conversation with feedback: {str(e)}")
                    return jsonify({"error": f"Error saving feedback: {str(e)}"}), 500
                
            except Exception as e:
                logger.error(f"Error processing Claude response: {str(e)}")
                
                # Create a fallback feedback response
                fallback_feedback = {
                    "feedback_summary": "We couldn't generate detailed feedback for this conversation. However, you've completed the conversation practice successfully.",
                    "main_strengths": ["Participation in Icelandic conversation practice"],
                    "areas_to_improve": ["Continue practicing with more conversations"],
                    "overall_score": 5
                }
                
                # Update the conversation record with the fallback feedback
                conversation.overall_feedback = fallback_feedback["feedback_summary"]
                conversation.main_strengths = json.dumps(fallback_feedback["main_strengths"])
                conversation.areas_to_improve = json.dumps(fallback_feedback["areas_to_improve"])
                conversation.overall_score = fallback_feedback["overall_score"]
                session.commit()
                
                return jsonify(fallback_feedback), 200
        
        # If the conversation is not completed, return an error
        return jsonify({"error": "This conversation is not completed yet. Please complete the conversation to get feedback."}), 400
        
    except Exception as e:
        logger.error(f"Error in get_conversation_feedback: {str(e)}")
        
        # Check if this is the specific error with newlines in JSON
        error_str = str(e)
        if '\n' in error_str and 'feedback_summary' in error_str:
            logger.info("Detected specific error with newlines in JSON, using fallback feedback")
            
            # Create a fallback feedback response
            fallback_feedback = {
                "feedback_summary": "We couldn't generate detailed feedback for this conversation. However, you've completed the conversation practice successfully.",
                "main_strengths": ["Participation in Icelandic conversation practice"],
                "areas_to_improve": ["Continue practicing with more conversations"],
                "overall_score": 5
            }
            
            # Update the conversation record with the fallback feedback
            conversation.overall_feedback = fallback_feedback["feedback_summary"]
            conversation.main_strengths = json.dumps(fallback_feedback["main_strengths"])
            conversation.areas_to_improve = json.dumps(fallback_feedback["areas_to_improve"])
            conversation.overall_score = fallback_feedback["overall_score"]
            session.commit()
            
            return jsonify({
                "feedback_summary": fallback_feedback["feedback_summary"],
                "main_strengths": fallback_feedback["main_strengths"],
                "areas_to_improve": fallback_feedback["areas_to_improve"],
                "overall_score": fallback_feedback["overall_score"],
                "conversation_id": conversation_id,
                "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None
            }), 200
        
        return jsonify({"error": f"Failed to retrieve feedback: {str(e)}"}), 500

# ---------------------------
# Main Entry Point
# ---------------------------
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
    # app.run(debug=True)