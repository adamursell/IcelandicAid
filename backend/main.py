import os
import json
import logging
import sys
from dotenv import load_dotenv
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from anthropic import Anthropic
import re
from datetime import datetime, timedelta
import requests
import urllib.parse
from functools import wraps

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------
# Load Environment Variables
# ---------------------------
# Load environment variables
load_dotenv()  # This will load from .env file in the current directory if it exists
API_KEY = os.getenv("APIKey") or os.getenv("ANTHROPIC_API_KEY")
if not API_KEY:
    logger.warning("API key not found in environment variables. Some features may not work.")

# Try to load from the API key env file - use a relative path or environment variable
api_key_path = os.getenv("API_KEY_PATH") or os.path.join(os.path.dirname(__file__), "APIKey.env")
if os.path.exists(api_key_path):
    logger.info(f"Loading API keys from: {api_key_path}")
    load_dotenv(api_key_path)
    # Check if we got the keys after loading
    API_KEY = API_KEY or os.getenv("ANTHROPIC_API_KEY")
    
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    logger.info("GOOGLE_API_KEY is set")
    # Print a masked version of the key for debugging
    masked_key = GOOGLE_API_KEY[:4] + "*" * (len(GOOGLE_API_KEY) - 8) + GOOGLE_API_KEY[-4:] if len(GOOGLE_API_KEY) > 8 else "****"
    logger.info(f"Google API Key (masked): {masked_key}")
else:
    logger.warning("GOOGLE_API_KEY not set. Text-to-speech functionality will not work.")


# Database configuration
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME")
DATABASE_URL = os.getenv("DATABASE_URL")  # For Render PostgreSQL

# Remove the hardcoded paths for security and portability
# Try to load PostgreSQL environment variables from postgres.env in a secure location
postgres_env_path = os.getenv("POSTGRES_ENV_PATH")
if postgres_env_path and os.path.exists(postgres_env_path):
    load_dotenv(postgres_env_path)
    logger.info(f"Loaded PostgreSQL environment variables from {postgres_env_path}")
else:
    logger.warning(f"PostgreSQL environment file not found at {postgres_env_path}")


# ---------------------------
# SQLAlchemy Setup & Database Models
# ---------------------------
from sqlalchemy import create_engine, func, desc, or_, and_, distinct, Column, String, Integer, Float, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import sessionmaker, scoped_session
from models import User, FlashcardLibrary, Flashcard, FlashcardGeneration, Analytics, Conversation, ConversationMessage, ConversationFeedback, PracticeStreak, PracticeSession, Base, Feedback

# Database configuration
# Check if DATABASE_URL is provided (common in cloud environments like Render)
if DATABASE_URL:
    # Get SSL mode from environment, default to 'require' for production (Render)
    ssl_mode = os.getenv("PGSSLMODE", "require")
    
    # Configure SSL based on environment
    connect_args = {"sslmode": ssl_mode} if ssl_mode else {}
    
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_recycle=1800,
        connect_args=connect_args
    )
    logger.info(f"Using PostgreSQL database from DATABASE_URL with SSL mode: {ssl_mode}")
# Check if PostgreSQL environment variables are set, otherwise fall back to SQLite
elif all([DB_USER, DB_PASSWORD, DB_HOST, DB_NAME]):
    # URL encode the password to handle special characters
    encoded_password = urllib.parse.quote_plus(DB_PASSWORD)
    db_url = f"postgresql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    
    # Get SSL mode from environment, default to 'prefer' for local development
    ssl_mode = os.getenv("PGSSLMODE", "prefer")
    
    # Configure SSL based on environment
    connect_args = {"sslmode": ssl_mode} if ssl_mode else {}
    
    # PostgreSQL-specific engine configuration
    engine = create_engine(
        db_url,
        echo=False,  # Set to True for debugging
        pool_size=5,  # Maximum number of connections to keep open
        max_overflow=10,  # Maximum number of connections to create above pool_size
        pool_timeout=30,  # Timeout for getting a connection from the pool
        pool_recycle=1800,  # Recycle connections after 30 minutes
        connect_args=connect_args
    )
    logger.info(f"Using PostgreSQL database from environment variables with SSL mode: {ssl_mode}")
else:
    db_url = "sqlite:///AppDatabase.db"
    logger.warning("PostgreSQL environment variables not set, falling back to SQLite")
    engine = create_engine(db_url, echo=False)

# Create a scoped session factory instead of a global session
Session = scoped_session(sessionmaker(bind=engine))

# ---------------------------
# Database Migration Helpers
# ---------------------------
def check_and_update_schema():
    """Check if database schema matches the models and add missing columns if needed."""
    from sqlalchemy import inspect
    
    inspector = inspect(engine)
    
    # Check users table for updated_at column
    try:
        user_columns = [col['name'] for col in inspector.get_columns('users')]
        if 'updated_at' not in user_columns:
            logger.warning("Adding missing updated_at column to users table")
            if engine.url.drivername == 'sqlite':
                # For SQLite, we need to use raw SQL or recreate the database
                # SQLite doesn't support ADD COLUMN with DEFAULT clause directly
                with engine.connect() as connection:
                    connection.execute("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP")
                    # Update existing rows with current timestamp
                    connection.execute("UPDATE users SET updated_at = CURRENT_TIMESTAMP")
                    connection.commit()
                logger.info("Added updated_at column to users table")
            else:
                # For other databases like PostgreSQL
                with engine.connect() as connection:
                    connection.execute("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
                    connection.commit()
                logger.info("Added updated_at column to users table")
    except Exception as e:
        logger.error(f"Error checking/updating users table schema: {str(e)}")
    
    # Check for challenging_words in conversation_feedbacks table
    try:
        if inspector.has_table('conversation_feedbacks'):
            feedback_columns = [col['name'] for col in inspector.get_columns('conversation_feedbacks')]
            if 'challenging_words' not in feedback_columns:
                logger.warning("Adding missing challenging_words column to conversation_feedbacks table")
                if engine.url.drivername == 'sqlite':
                    with engine.connect() as connection:
                        connection.execute("ALTER TABLE conversation_feedbacks ADD COLUMN challenging_words TEXT")
                        connection.commit()
                    logger.info("Added challenging_words column to conversation_feedbacks table")
                else:
                    with engine.connect() as connection:
                        connection.execute("ALTER TABLE conversation_feedbacks ADD COLUMN challenging_words TEXT")
                        connection.commit()
                    logger.info("Added challenging_words column to conversation_feedbacks table")
    except Exception as e:
        logger.error(f"Error checking/updating conversation_feedbacks table schema: {str(e)}")

# Create the tables in the database (if they don't already exist)
Base.metadata.create_all(engine)
logger.info("Database tables created.")

# Check and update database schema for existing tables
check_and_update_schema()
logger.info("Database schema checked and updated if needed.")

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

# Set up request hooks to manage sessions
@app.teardown_appcontext
def cleanup(exception=None):
    """Remove the database session at the end of the request."""
    Session.remove()

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

@app.route('/', methods=['GET'])
def root():
    return jsonify({"message": "Kenni API - Welcome! Use /health to check API status."}), 200

@app.route('/favicon.ico')
def favicon():
    return "", 204  # No content response

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
        if Session.query(User).filter_by(email=email).first():
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
        Session.add(new_user)
        Session.commit()
        return jsonify({'message': 'User created successfully'}), 201

    except Exception as e:
        Session.rollback()
        return jsonify({'message': f'Database error: {str(e)}'}), 500
    finally:
        Session.close()

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

    try:
        user = Session.query(User).filter_by(email=email).first()
        
        if not user:
            return jsonify({'message': 'Invalid email or password'}), 401  # 401 Unauthorized

        # Check the password against the stored hash
        if check_password_hash(user.password_hash, password):
            # Fetch user ID and return it in the response
            user_id = user.id
            return jsonify({'message': 'Login successful', 'user_id': user_id}), 200
        else:
            return jsonify({'message': 'Invalid email or password'}), 401
    except Exception as e:
        # Log the error for debugging
        logger.error(f"Login error: {str(e)}")
        # Ensure transaction is rolled back on error
        Session.rollback()
        return jsonify({'message': f'Login error: {str(e)}'}), 500

# Add this new endpoint after the login/register endpoints
@app.route('/users/<int:user_id>', methods=['GET', 'PUT'])
def manage_user(user_id):
    """Get or update user information."""
    try:
        user = Session.query(User).get(user_id)
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

            Session.commit()
            return jsonify({"message": "User information updated successfully"}), 200

    except Exception as e:
        Session.rollback()
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
        user = Session.get(User, user_id)
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
                user_id=user_id,
                library_id=library.id,
                front_text=flashcard_data['front'],
                back_text=flashcard_data['back'],
                additional_info=flashcard_data.get('additional_info', ''),
                next_repetition_space=1,  # Initial repetition space is 1 day
                next_practice_time=func.now()  # Initial practice time is now (immediately available)
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
        flashcards = (Session.query(Flashcard)
                     .join(FlashcardLibrary)
                     .filter(FlashcardLibrary.user_id == user_id)
                     .all())
        
        logger.info(f"Found {len(flashcards)} flashcards")

        results = [{
            "id": fc.id,
            "front": fc.front_text,
            "back": fc.back_text,
            "additional_info": fc.additional_info or "",
            "topic": Session.query(FlashcardLibrary).get(fc.library_id).library_name
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
        flashcard = Session.query(Flashcard).get(flashcard_id)
        if not flashcard:
            return jsonify({"error": "Flashcard not found"}), 404
            
        Session.delete(flashcard)
        Session.commit()
        return jsonify({"message": "Flashcard deleted successfully."}), 200
        
    except Exception as e:
        logger.error(f"Error deleting flashcard: {e}")
        Session.rollback()
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
    topic = data.get("topic")  # Get the topic from the request

    try:
        # Get the flashcard from the database
        flashcard = Session.query(Flashcard).get(flashcard_id)
        if not flashcard:
            return jsonify({"error": "Flashcard not found"}), 404

        # Get the current library to check if topic has changed
        current_library = Session.query(FlashcardLibrary).get(flashcard.library_id)
        
        # If topic is provided and has changed, update the library
        if topic is not None and topic != current_library.library_name:
            # Get the user_id from the flashcard
            user_id = flashcard.user_id
            
            # Find or create a library with the new topic name
            new_library = Session.query(FlashcardLibrary).filter_by(
                user_id=user_id, 
                library_name=topic
            ).first()
            
            if not new_library:
                # Create a new library if it doesn't exist
                new_library = FlashcardLibrary(
                    user_id=user_id,
                    library_name=topic
                )
                Session.add(new_library)
                Session.flush()  # Get the ID without committing
            
            # Update the flashcard's library_id
            flashcard.library_id = new_library.id

        # Update the other fields if they are provided
        if front is not None:
            flashcard.front_text = front
        if back is not None:
            flashcard.back_text = back
        if additional_info is not None:
            flashcard.additional_info = additional_info

        # Commit the changes
        Session.commit()

        # Get the updated library name
        updated_library = Session.query(FlashcardLibrary).get(flashcard.library_id)

        return jsonify({
            "message": "Flashcard updated successfully",
            "flashcard": {
                "id": flashcard.id,
                "front": flashcard.front_text,
                "back": flashcard.back_text,
                "additional_info": flashcard.additional_info,
                "topic": updated_library.library_name
            }
        }), 200

    except Exception as e:
        logger.error(f"Error updating flashcard: {str(e)}")
        Session.rollback()
        return jsonify({"error": str(e)}), 500

################# Flashcard practice API endpoints

@app.route('/users/<int:user_id>/topics', methods=['GET'])
def get_user_topics(user_id):
    """Get all available flashcard topics for a user."""
    try:
        # Query distinct topics from user's libraries that have flashcards
        topics = (Session.query(FlashcardLibrary.library_name)
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
        query = (Session.query(Flashcard)
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
            "topic": Session.query(FlashcardLibrary).get(fc.library_id).library_name
        } for fc in flashcards]

        return jsonify({
            "flashcards": results,
            "total_available": total_cards
        }), 200

    except Exception as e:
        logger.error(f"Error fetching practice flashcards: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/users/<int:user_id>/spaced-practice', methods=['GET'])
def get_spaced_practice_flashcards(user_id):
    try:
        topic = request.args.get('topic', default=None, type=str)
        
        # Get the current time to check against next_practice_time
        current_time = datetime.now()
        logger.info(f"Fetching spaced practice flashcards for user {user_id} at {current_time.isoformat()}")
        
        # Base query joining Flashcard with FlashcardLibrary
        query = (Session.query(Flashcard)
                .join(FlashcardLibrary)
                .filter(FlashcardLibrary.user_id == user_id)
                .filter(Flashcard.next_practice_time <= current_time))  # Only cards due for practice
                
        logger.info(f"SQL Query for spaced practice: {str(query)}")
        
        # If specific topic is requested (and it's not "all")
        if topic and topic.lower() != 'all':
            query = query.filter(FlashcardLibrary.library_name == topic)
            logger.info(f"Added topic filter: {topic}")
        
        # Query all flashcards to check due status (for debugging)
        all_flashcards = (Session.query(Flashcard)
                         .join(FlashcardLibrary)
                         .filter(FlashcardLibrary.user_id == user_id)
                         .all())
                         
        logger.info(f"User {user_id} has {len(all_flashcards)} total cards")
        
        # Count how many are actually due
        due_cards = [fc for fc in all_flashcards if fc.next_practice_time <= current_time]
        logger.info(f"User {user_id} has {len(due_cards)} cards due for practice out of {len(all_flashcards)} total")
        
        # Log the first few cards' next practice times for debugging
        for idx, fc in enumerate(all_flashcards[:10]):  # Log first 10 cards max
            time_diff = (fc.next_practice_time - current_time).total_seconds() / 86400  # Convert to days
            is_due = fc.next_practice_time <= current_time
            logger.info(f"Card {idx+1}/{len(all_flashcards)}: id={fc.id}, " +
                       f"next_practice_time={fc.next_practice_time.isoformat()}, " +
                       f"is_due={is_due}, " +
                       f"days_until_due={time_diff:.2f}, " +
                       f"repetition_space={fc.next_repetition_space}")
        
        # Get total available cards for the query
        total_cards = query.count()
        logger.info(f"Found {total_cards} cards due for practice for user {user_id}")
        
        # Get all due flashcards, ordered randomly
        flashcards = (query
                     .order_by(func.random())
                     .all())
        
        if not flashcards:
            logger.info(f"No flashcards due for practice for user {user_id}")
            return jsonify({
                "message": "No flashcards due for practice", 
                "flashcards": [],
                "total_available": 0
            }), 200

        # Build the response data with complete card information
        results = []
        for fc in flashcards:
            days_until_due = (fc.next_practice_time - current_time).total_seconds() / 86400  # Convert to days
            results.append({
                "id": fc.id,
                "front": fc.front_text,
                "back": fc.back_text,
                "additional_info": fc.additional_info,
                "topic": Session.query(FlashcardLibrary).get(fc.library_id).library_name,
                "next_repetition_space": fc.next_repetition_space,
                "next_practice_time": fc.next_practice_time.isoformat(),
                "is_due": True,  # These are all due by definition
                "days_until_due": days_until_due  # Will be negative for due cards
            })

        logger.info(f"Returning {len(results)} due flashcards for spaced repetition practice")
        return jsonify({
            "flashcards": results,
            "total_available": total_cards
        }), 200

    except Exception as e:
        logger.error(f"Error fetching spaced practice flashcards: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/users/<int:user_id>/practice/next', methods=['POST'])
def get_next_practice_card(user_id):
    """Get next flashcard when a card is kept for more practice."""
    try:
        data = request.get_json()
        current_card_id = data.get('current_card_id')
        topic = data.get('topic')
        
        # If we have a current card ID, return that specific card
        # since the user marked it for more practice
        if current_card_id:
            current_card = Session.query(Flashcard).get(current_card_id)
            if current_card:
                result = {
                    "id": current_card.id,
                    "front": current_card.front_text,
                    "back": current_card.back_text,
                    "additional_info": current_card.additional_info,
                    "topic": Session.query(FlashcardLibrary).get(current_card.library_id).library_name
                }
                return jsonify(result), 200
        
        # Base query for getting a random card if no current card or it wasn't found
        query = (Session.query(Flashcard)
                .join(FlashcardLibrary)
                .filter(FlashcardLibrary.user_id == user_id))
        
        # Apply topic filter if specified
        if topic and topic.lower() != 'all':
            query = query.filter(FlashcardLibrary.library_name == topic)
        
        next_card = query.order_by(func.random()).first()
        
        if not next_card:
            return jsonify({"message": "No more cards available"}), 404
            
        result = {
            "id": next_card.id,
            "front": next_card.front_text,
            "back": next_card.back_text,
            "additional_info": next_card.additional_info,
            "topic": Session.query(FlashcardLibrary).get(next_card.library_id).library_name
        }
        
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error fetching next practice flashcard: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/users/<int:user_id>/spaced-practice/next', methods=['POST'])
def get_next_spaced_practice_card(user_id):
    """Get next flashcard for spaced repetition practice and update the current card's parameters."""
    try:
        data = request.get_json()
        current_card_id = data.get('current_card_id')
        is_correct = data.get('is_correct', False)
        
        logger.info(f"Processing spaced practice card: user_id={user_id}, card_id={current_card_id}, is_correct={is_correct}")
        
        # Update the current card's spaced repetition parameters if provided
        updated_card = None
        updated_card_info = {}  # Store information about the updated card
        if current_card_id:
            current_card = Session.query(Flashcard).filter(Flashcard.id == current_card_id).first()
            
            if current_card:
                logger.info(f"Found card {current_card_id} - Current state: space={current_card.next_repetition_space}, next_practice_time={current_card.next_practice_time}")
                
                if is_correct:
                    # Double the repetition space and update next practice time
                    old_space = current_card.next_repetition_space
                    current_card.next_repetition_space = current_card.next_repetition_space * 2
                    # Set next practice time to current time + repetition space days
                    new_practice_time = datetime.now() + timedelta(days=current_card.next_repetition_space)
                    current_card.next_practice_time = new_practice_time
                    updated_card = current_card
                    
                    # Store the updated card information to return to the frontend
                    updated_card_info = {
                        "id": current_card.id,
                        "next_repetition_space": current_card.next_repetition_space,
                        "next_practice_time": new_practice_time.isoformat()
                    }
                    
                    logger.info(f"Card {current_card_id} marked correct: repetition space updated from {old_space} to {current_card.next_repetition_space} days")
                    logger.info(f"Next practice time set to {new_practice_time.isoformat()}")
                else:
                    # Reduce repetition space to minimum of 1 day or half current value
                    old_space = current_card.next_repetition_space
                    current_card.next_repetition_space = max(1, current_card.next_repetition_space // 2)
                    # For incorrect answers, set next_practice_time to now
                    current_card.next_practice_time = datetime.now()
                    updated_card = current_card
                    
                    # Store the updated card information to return to the frontend
                    updated_card_info = {
                        "id": current_card.id,
                        "next_repetition_space": current_card.next_repetition_space,
                        "next_practice_time": current_card.next_practice_time.isoformat()
                    }
                    
                    logger.info(f"Card {current_card_id} marked incorrect: repetition space updated from {old_space} to {current_card.next_repetition_space} days")
                    logger.info(f"Next practice time set to now")
                
                try:
                    # Explicitly commit the changes to the database
                    Session.commit()
                    
                    # Refresh the card from the database to ensure we have the latest values
                    Session.refresh(current_card)
                    
                    # Re-fetch the card to verify the changes were saved
                    verification_card = Session.query(Flashcard).filter(Flashcard.id == current_card_id).first()
                    logger.info(f"Verification after update: card {current_card_id} has space={verification_card.next_repetition_space}, next_practice_time={verification_card.next_practice_time}")
                    
                    # Update our reference to use the refreshed card
                    updated_card = verification_card
                    
                    logger.info(f"Database successfully updated for card {current_card_id}")
                except Exception as commit_error:
                    logger.error(f"Failed to commit changes to card {current_card_id}: {str(commit_error)}")
                    logger.error(f"Error details: {type(commit_error).__name__}")
                    import traceback
                    logger.error(traceback.format_exc())
                    Session.rollback()
                    return jsonify({"error": f"Database error: {str(commit_error)}"}), 500
            else:
                logger.warning(f"Card with ID {current_card_id} not found for user {user_id}")
        else:
            logger.warning(f"No card ID provided in request for user {user_id}")
        
        # Create a fresh query to get the most up-to-date data
        # Use a new Session query to ensure we're getting fresh data after the commit
        Session.expire_all()  # Force reload from DB
        
        # For all cases, explicitly filter out the card that was just updated
        query = (Session.query(Flashcard)
                .join(FlashcardLibrary)
                .filter(FlashcardLibrary.user_id == user_id)
                .filter(Flashcard.next_practice_time <= func.now()))  # Only cards due for practice
        
        # Always exclude the current card from next results if it was marked as correct
        if current_card_id and is_correct:
            query = query.filter(Flashcard.id != current_card_id)
        
        # Log how many cards are still due
        due_cards_count = query.count()
        logger.info(f"User {user_id} has {due_cards_count} cards still due for practice")
        
        next_card = query.order_by(func.random()).first()
        
        # Only use the updated card for incorrect answers if no other cards are available
        if not next_card and updated_card and not is_correct:
            logger.info(f"No other due cards for user {user_id}, returning the current card {current_card_id}")
            next_card = updated_card
        
        if not next_card:
            logger.info(f"No more cards available for user {user_id}")
            # Include the updated card info in the response
            response_data = {
                "message": "No more cards available for practice",
                "cards_completed": True
            }
            if updated_card_info:
                response_data["updated_card"] = updated_card_info
            
            return jsonify(response_data), 200
            
        result = {
            "id": next_card.id,
            "front": next_card.front_text,
            "back": next_card.back_text,
            "additional_info": next_card.additional_info,
            "topic": Session.query(FlashcardLibrary).get(next_card.library_id).library_name,
            "next_repetition_space": next_card.next_repetition_space,
            "cards_remaining": due_cards_count
        }
        
        # Include information about the updated card in the response
        if updated_card_info:
            result["updated_card"] = updated_card_info
        
        logger.info(f"Returning next card {next_card.id} for user {user_id}, {due_cards_count} cards remaining")
        logger.info(f"Response data: {result}")
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error in spaced repetition practice: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
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
5. A list of 5-10 challenging words or phrases that the student struggled with during the conversation

CRITICAL INSTRUCTION: Your response MUST be ONLY a valid JSON object with EXACTLY this structure:
{
  "feedback_summary": "Replace this with your actual summary of the student's performance",
  "main_strengths": ["Replace with actual strength 1", "Replace with actual strength 2", "Replace with actual strength 3"],
  "areas_to_improve": ["Replace with actual area 1", "Replace with actual area 2", "Replace with actual area 3"],
  "overall_score": 0,
  "challenging_words": [
    {"icelandic": "Icelandic word", "english": "English translation", "part_of_speech": "noun/verb/adjective/etc", "note": "Brief explanation of usage/difficulty"}
  ]
}

EXTREMELY IMPORTANT:
- Your response MUST begin with the opening curly brace '{' with NO preceding characters, not even whitespace or newlines.
- Replace the placeholder text and values above with your actual feedback.
- The overall_score should be a number between 1 and 10, not a string.
- The challenging_words array should contain 5-10 objects, each with icelandic, english, part_of_speech, and note fields.
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
        user = Session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        # Create a new conversation record
        new_conversation = Conversation(
            user_id=user_id,
            scenario=scenario
        )
        Session.add(new_conversation)
        Session.commit()

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
                content=icelandic_text
            )
            Session.add(new_message)
            
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
            Session.add(new_message)
            Session.commit()
            
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
        conversation = Session.query(Conversation).filter_by(id=conversation_id, user_id=user_id).first()
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
        Session.add(user_message)
        Session.commit()
        
        # Get all messages in this conversation
        messages = Session.query(ConversationMessage).filter_by(conversation_id=conversation_id).order_by(ConversationMessage.created_at).all()
        
        # Format the conversation history for the prompt
        conversation_history = ""
        for msg in messages:
            if msg.role == "user":
                conversation_history += f"Student: {msg.content}\n\n"
            else:
                conversation_history += f"Assistant: {msg.content}\n\n"
        
        # Get user information
        user = Session.query(User).filter_by(id=user_id).first()
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
                Session.add(assistant_message)
                
                # Add feedback for the user's message
                feedback_json = {
                    "grammar_notes": grammar_notes,
                    "vocabulary_suggestions": vocabulary_suggestions,
                    "overall_feedback": overall_feedback
                }
                user_message.feedback = json.dumps(feedback_json)
                Session.commit()
                
                # If the conversation is marked as complete by the LLM, mark it as completed
                if conversation_complete:
                    # Mark the conversation as completed
                    conversation.completed_at = func.now()
                    Session.commit()
                    
                    # Generate feedback for the completed conversation
                    try:
                        # Call the end_conversation endpoint
                        feedback_data = {
                            "user_id": user_id,
                            "conversation_id": conversation_id
                        }
                        logger.info(f"Calling end_conversation endpoint for conversation {conversation_id}")
                        # Make an internal request to generate feedback
                        with app.test_client() as client:
                            feedback_response = client.post(
                                '/end_conversation',
                                json=feedback_data,
                                content_type='application/json'
                            )
                            
                            if feedback_response.status_code == 200:
                                try:
                                    feedback_result = json.loads(feedback_response.data)
                                    logger.info(f"Generated feedback for completed conversation: {feedback_result}")
                                except json.JSONDecodeError as json_err:
                                    logger.error(f"Error parsing feedback response: {str(json_err)}, Response data: {feedback_response.data}")
                            else:
                                logger.error(f"Failed to generate feedback: Status code {feedback_response.status_code}, Response: {feedback_response.data}")
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
                Session.add(assistant_message)
                Session.commit()
                
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
            Session.add(assistant_message)
            Session.commit()
            
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

@app.route('/end_conversation', methods=['POST'])
def end_conversation():
    data = request.get_json()
    user_id = data.get('user_id')
    conversation_id = data.get('conversation_id')
    force_regenerate = data.get('force_regenerate', False)  # New parameter to force regeneration
    
    logger.info(f"Ending conversation: user_id={user_id}, conversation_id={conversation_id}, force_regenerate={force_regenerate}")
    
    try:
        # Get the conversation
        conversation = Session.query(Conversation).filter_by(id=conversation_id, user_id=user_id).first()
        if not conversation:
            logger.error(f"Conversation not found: user_id={user_id}, conversation_id={conversation_id}")
            return jsonify({"error": "Conversation not found"}), 404
            
        # Check if the conversation is already completed
        if conversation.completed_at and not force_regenerate:
            logger.info(f"Conversation {conversation_id} is already marked as completed")
            
            # Check if feedback already exists in the new table
            existing_feedback = Session.query(ConversationFeedback).filter_by(
                conversation_id=conversation_id
            ).first()
            
            if existing_feedback:
                logger.info(f"Feedback already exists for conversation {conversation_id}, returning existing feedback")
                # Check if challenging words exist
                if existing_feedback.challenging_words:
                    try:
                        challenging_words = json.loads(existing_feedback.challenging_words)
                        if len(challenging_words) > 0:
                            logger.info(f"Found {len(challenging_words)} challenging words in existing feedback")
                        else:
                            logger.info("No challenging words found in existing feedback")
                    except json.JSONDecodeError:
                        logger.error("Error parsing challenging words from existing feedback")
                
                return jsonify({
                    "message": "Conversation already ended",
                    "feedback_available": True,
                    "conversation_id": conversation_id
                }), 200
        
        # If force_regenerate is true, we'll delete any existing feedback
        if force_regenerate:
            logger.info(f"Force regenerating feedback for conversation {conversation_id}")
            existing_feedback = Session.query(ConversationFeedback).filter_by(
                conversation_id=conversation_id
            ).first()
            
            if existing_feedback:
                logger.info(f"Deleting existing feedback for conversation {conversation_id}")
                Session.delete(existing_feedback)
                Session.commit()
        
        # Mark the conversation as completed if not already
        if not conversation.completed_at:
            conversation.completed_at = func.now()
            Session.commit()
            logger.info(f"Marked conversation {conversation_id} as completed")
        
        # Get all user messages with feedback in this conversation
        user_messages = Session.query(ConversationMessage).filter_by(
            conversation_id=conversation_id,
            role="user"
        ).order_by(ConversationMessage.created_at).all()
        
        # Extract feedback from user messages
        feedback_collection = []
        for msg in user_messages:
            if msg.feedback:
                try:
                    feedback_json = json.loads(msg.feedback)
                    feedback_collection.append({
                        "message": msg.content,
                        "feedback": feedback_json
                    })
                except json.JSONDecodeError:
                    logger.warning(f"Could not parse feedback JSON for message {msg.id}")
        
        # If no feedback found, return early
        if not feedback_collection:
            logger.warning(f"No feedback found for any messages in conversation {conversation_id}")
            return jsonify({
                "message": "Conversation ended, but no feedback available to generate summary",
                "conversation_id": conversation_id,
                "feedback_available": False
            }), 200
        
        # Get user information for personalization
        user = Session.query(User).filter_by(id=user_id).first()
        if not user:
            logger.error(f"User not found: user_id={user_id}")
            return jsonify({"error": "User not found"}), 404
        
        # Format the feedback for the prompt
        formatted_feedback = ""
        user_messages_collection = []
        
        for item in feedback_collection:
            formatted_feedback += f"Student message: {item['message']}\n"
            user_messages_collection.append(item['message'])
            formatted_feedback += "Feedback:\n"
            
            if item['feedback'].get("grammar_notes"):
                formatted_feedback += "Grammar notes: " + ", ".join(item['feedback']["grammar_notes"]) + "\n"
            
            if item['feedback'].get("vocabulary_suggestions"):
                formatted_feedback += "Vocabulary suggestions: " + ", ".join([f"{k}: {v}" for k, v in item['feedback']["vocabulary_suggestions"].items()]) + "\n"
            
            if item['feedback'].get("overall_feedback"):
                formatted_feedback += f"Overall: {item['feedback']['overall_feedback']}\n"
            
            formatted_feedback += "\n"
        
        # Create a separate section with just the user's messages for better analysis
        user_messages_text = "Student's Icelandic messages during the conversation:\n"
        for i, message in enumerate(user_messages_collection, 1):
            user_messages_text += f"{i}. {message}\n"
        
        # Create the prompt for generating the feedback summary
        system_prompt = f"""You are an Icelandic language tutor providing feedback on a conversation practice session.
You will be given feedback that was provided for individual messages in a conversation, as well as the student's actual Icelandic messages.
Your task is to analyze both the feedback and the student's original messages to generate a comprehensive overall summary.

Consider the student's skill level ({user.skill_level or 'beginner'}) when providing feedback.
Be encouraging but honest about areas that need improvement.

Follow this step-by-step process to evaluate the student's performance:
1. First, analyze what the student did well based on both the feedback and their actual messages
2. Next, identify what areas need improvement based on both the feedback and their actual messages
3. Then, evaluate the grammatical accuracy on a scale from 0 to 10:
   - Score 10: No grammatical mistakes at all
   - Score 0: Every word had grammatical errors
   - Consider word order, verb conjugation, noun declension, etc.
4. Next, evaluate vocabulary quality on a scale from 0 to 10:
   - Score 10: Always used the most appropriate vocabulary for the context and conveyed meaning perfectly
   - Score 0: Did not use any vocabulary that conveyed the correct meaning
   - Consider word choice, idioms, formality level, etc.
5. Identify 5-10 challenging words or phrases that the student struggled with in Icelandic, with English translations and notes
6. Finally, consider all the above factors to determine an overall score from 1 to 10

Return ONLY a valid JSON object with the following structure:
{{
  "feedback_summary": "One sentence summary of overall performance",
  "main_strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "areas_to_improve": ["Area 1", "Area 2", "Area 3"],
  "grammar_score": number between 0 and 10,
  "vocabulary_score": number between 0 and 10,
  "overall_score": number between 1 and 10,
  "challenging_words": [
    {{"icelandic": "Icelandic word", "english": "English translation", "part_of_speech": "noun/verb/etc", "note": "Brief explanation"}}
  ]
}}

The JSON must be valid with no extra text before or after. Do not include explanations outside the JSON structure.
"""
        
        # Call Claude API to generate the feedback summary
        try:
            client = Anthropic(api_key=API_KEY)
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1024,
                temperature=0.3,
                system=system_prompt,
                messages=[{
                    "role": "user",
                    "content": f"Here is the feedback from an Icelandic conversation practice session:\n\n{formatted_feedback}\n\n{user_messages_text}\n\nPlease provide an overall summary based on this feedback and the student's actual messages. Remember that it is CRITICAL to stick to the JSON format and generate nothing outside of the JSON structure."
                }]
            )
            
            # Extract and clean the response
            raw_response = response.content[0].text
            logger.info(f"Raw Claude response for conversation {conversation_id}:\n{raw_response}")
            
            # Clean and parse the JSON response
            cleaned_response = raw_response.strip()
            
            # Extract JSON object
            json_start = cleaned_response.find('{')
            json_end = cleaned_response.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = cleaned_response[json_start:json_end]
                
                # Clean the JSON string
                json_str = re.sub(r'\s+', ' ', json_str)  # Normalize whitespace
                json_str = json_str.replace('\n', ' ')    # Remove newlines
                
                try:
                    feedback_data = json.loads(json_str)
                    logger.info(f"Successfully parsed feedback JSON: {feedback_data}")
                    
                    # Validate the required fields
                    required_fields = ["feedback_summary", "main_strengths", "areas_to_improve", "grammar_score", "vocabulary_score", "overall_score"]
                    if not all(k in feedback_data for k in required_fields):
                        raise ValueError("Missing required fields in feedback JSON")
                    
                    # Extract and store challenging words if available
                    challenging_words = feedback_data.get("challenging_words", [])
                    logger.info(f"Extracted {len(challenging_words)} challenging words from feedback")
                    
                    # Log each challenging word for debugging
                    for i, word in enumerate(challenging_words):
                        logger.info(f"Word {i+1}: {word.get('icelandic', '(missing)')} - {word.get('english', '(missing)')}")
                    
                    # Create a new ConversationFeedback record
                    new_feedback = ConversationFeedback(
                        user_id=user_id,
                        conversation_id=conversation_id,
                        feedback_summary=feedback_data["feedback_summary"],
                        main_strengths=json.dumps(feedback_data["main_strengths"]),
                        areas_to_improve=json.dumps(feedback_data["areas_to_improve"]),
                        grammar_score=feedback_data["grammar_score"],
                        vocabulary_score=feedback_data["vocabulary_score"],
                        overall_score=feedback_data["overall_score"],
                        challenging_words=json.dumps(challenging_words)  # Store challenging words as JSON
                    )
                    
                    # Log the challenging_words JSON string that's being stored
                    logger.info(f"Storing challenging_words JSON: {json.dumps(challenging_words)}")
                    
                    Session.add(new_feedback)
                    Session.commit()
                    logger.info(f"Saved feedback summary for conversation {conversation_id}")
                    
                    return jsonify({
                        "message": "Conversation ended and feedback generated successfully",
                        "feedback_available": True,
                        "conversation_id": conversation_id,
                        "has_challenging_words": len(challenging_words) > 0,
                        "challenging_words_count": len(challenging_words)
                    }), 200
                    
                except (json.JSONDecodeError, ValueError) as e:
                    logger.error(f"Error parsing feedback JSON: {str(e)}")
                    # Continue to fallback
            
            # If we get here, something went wrong with parsing the JSON
            logger.warning(f"Could not parse feedback JSON from Claude response for conversation {conversation_id}")
            return jsonify({
                "message": "Conversation ended, but there was an issue generating feedback",
                "error": str(e),
                "feedback_available": False,
                "conversation_id": conversation_id
            }), 200
            
        except Exception as e:
            logger.error(f"Error calling Claude API: {str(e)}")
            return jsonify({
                "message": "Conversation ended, but there was an error generating feedback",
                "error": str(e),
                "feedback_available": False,
                "conversation_id": conversation_id
            }), 200
    
    except Exception as e:
        logger.error(f"Error in end_conversation: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/users/<int:user_id>/learning_profile', methods=['GET'])
def get_user_learning_profile(user_id):
    try:
        # Get the user
        user = Session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        # Get all completed conversations for this user
        conversations = Session.query(Conversation).filter(
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
            # First check for feedback in the new table
            feedback = Session.query(ConversationFeedback).filter_by(
                conversation_id=conversation.id
            ).first()
            
            if feedback:
                # Parse challenging words if available
                challenging_words = []
                if feedback.challenging_words:
                    try:
                        challenging_words = json.loads(feedback.challenging_words)
                    except json.JSONDecodeError:
                        logger.error(f"JSON decode error when retrieving challenging words for conversation {conversation.id}")
                        challenging_words = []
                
                learning_profile["conversation_history"].append({
                    "conversation_id": conversation.id,
                    "scenario": conversation.scenario,
                    "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None,
                    "feedback_summary": feedback.feedback_summary,
                    "main_strengths": json.loads(feedback.main_strengths) if feedback.main_strengths else [],
                    "areas_to_improve": json.loads(feedback.areas_to_improve) if feedback.areas_to_improve else [],
                    "overall_score": feedback.overall_score,
                    "challenging_words": challenging_words
                })
            # For backward compatibility, check the old format
            elif conversation.overall_feedback:
                learning_profile["conversation_history"].append({
                    "conversation_id": conversation.id,
                    "scenario": conversation.scenario,
                    "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None,
                    "feedback_summary": conversation.overall_feedback,
                    "main_strengths": json.loads(conversation.main_strengths) if conversation.main_strengths else [],
                    "areas_to_improve": json.loads(conversation.areas_to_improve) if conversation.areas_to_improve else [],
                    "overall_score": conversation.overall_score,
                    "challenging_words": []  # Old format doesn't have challenging words
                })
        
        return jsonify(learning_profile), 200
            
    except Exception as e:
        print(f"Error in get_user_learning_profile: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/conversations/<int:conversation_id>/feedback', methods=['GET'])
def get_conversation_feedback(conversation_id):
    try:
        # Get the conversation
        conversation = Session.query(Conversation).filter_by(id=conversation_id).first()
        if not conversation:
            logger.error(f"Conversation not found: {conversation_id}")
            return jsonify({"error": "Conversation not found"}), 404
            
        # Check if feedback exists in the new table
        feedback = Session.query(ConversationFeedback).filter_by(conversation_id=conversation_id).first()
        
        logger.info(f"Getting feedback for conversation {conversation_id}")
        
        if feedback:
            try:
                # Get challenging words if available
                challenging_words = []
                if feedback.challenging_words:
                    try:
                        logger.info(f"Parsing challenging words from: {feedback.challenging_words}")
                        challenging_words = json.loads(feedback.challenging_words)
                        logger.info(f"Found {len(challenging_words)} challenging words")
                        
                        # Format challenging words for display in a table with save button
                        for word in challenging_words:
                            # Make sure all required fields exist
                            word['icelandic'] = word.get('icelandic', '')
                            word['english'] = word.get('english', '')
                            word['part_of_speech'] = word.get('part_of_speech', '')
                            word['note'] = word.get('note', '')
                            # Add a flag to indicate these words can be saved to library
                            word['can_save_to_library'] = True
                    except json.JSONDecodeError:
                        logger.error(f"JSON decode error when retrieving challenging words")
                        challenging_words = []
                else:
                    logger.info("No challenging words found in feedback")
                
                # Return the feedback from the new table
                response_data = {
                    "feedback_summary": feedback.feedback_summary,
                    "main_strengths": json.loads(feedback.main_strengths) if feedback.main_strengths else [],
                    "areas_to_improve": json.loads(feedback.areas_to_improve) if feedback.areas_to_improve else [],
                    "grammar_score": feedback.grammar_score,
                    "vocabulary_score": feedback.vocabulary_score,
                    "overall_score": feedback.overall_score,
                    "conversation_id": conversation_id,
                    "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
                    "challenging_words": challenging_words,
                    "challenging_words_table": {
                        "title": "Words You Struggled With",
                        "description": "These are words you found challenging during the conversation. Click 'Save to Library' to add them to your flashcard collection.",
                        "words": challenging_words
                    }
                }
                
                logger.info(f"Returning feedback with {len(challenging_words)} challenging words")
                return jsonify(response_data), 200
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error when retrieving feedback: {str(e)}")
                return jsonify({
                    "error": f"JSON parsing error in stored feedback: {str(e)}",
                    "conversation_id": conversation_id
                }), 500
        
        # Check if feedback exists in the old format (for backward compatibility)
        if conversation.overall_feedback:
            logger.info(f"Using legacy feedback format for conversation {conversation_id}")
            try:
                # Return the feedback from the conversation table
                return jsonify({
                    "feedback_summary": conversation.overall_feedback,
                    "main_strengths": json.loads(conversation.main_strengths) if conversation.main_strengths else [],
                    "areas_to_improve": json.loads(conversation.areas_to_improve) if conversation.areas_to_improve else [],
                    "overall_score": conversation.overall_score,
                    "conversation_id": conversation_id,
                    "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else None,
                    "challenging_words": [],
                    "challenging_words_table": {
                        "title": "Words You Struggled With",
                        "description": "No challenging words were identified for this conversation.",
                        "words": []
                    }
                }), 200
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error when retrieving old feedback format: {str(e)}")
                return jsonify({
                    "error": f"JSON parsing error in stored feedback: {str(e)}",
                    "conversation_id": conversation_id
                }), 500
        
        # If no feedback exists, check if the conversation is completed
        if conversation.completed_at:
            # If completed but no feedback, suggest generating it
            logger.info(f"Conversation {conversation_id} is completed but has no feedback")
            return jsonify({
                "message": "Conversation is completed but no feedback is available. Try ending the conversation again to generate feedback.",
                "conversation_id": conversation_id,
                "feedback_available": False
            }), 200
        else:
            # If not completed, return appropriate message
            logger.info(f"Conversation {conversation_id} is not yet completed")
            return jsonify({
                "message": "Conversation is not yet completed. End the conversation first to generate feedback.",
                "conversation_id": conversation_id,
                "feedback_available": False
            }), 200
            
    except Exception as e:
        logger.error(f"Error in get_conversation_feedback: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/users/<int:user_id>/progress', methods=['GET'])
def get_user_progress(user_id):
    try:
        # Get the user
        user = Session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        # Initialize response object
        progress_data = {
            "conversation": {
                "total_conversations": 0,
                "overall_score": {
                    "average": 0,
                    "last_10": []
                },
                "grammar_score": {
                    "average": 0,
                    "last_10": []
                },
                "vocabulary_score": {
                    "average": 0,
                    "last_10": []
                },
                "strengths": [],
                "areas_to_improve": [],
                "streak": {
                    "current": 0,
                    "longest": 0
                }
            },
            "flashcards": {
                "total_flashcards": 0,
                "total_topics": 0,
                "word_types": {},
                "knowledge_levels": {
                    "unpracticed": 0,
                    "recognised": 0,
                    "developing": 0,
                    "confident": 0,
                    "mastered": 0
                },
                "streak": {
                    "current": 0,
                    "longest": 0,
                    "due_today": 0
                }
            }
        }
        
        # Get conversation data
        conversations = Session.query(Conversation).filter(
            Conversation.user_id == user_id, 
            Conversation.completed_at != None
        ).order_by(Conversation.completed_at.desc()).all()
        
        progress_data["conversation"]["total_conversations"] = len(conversations)
        
        # Process conversation feedback data
        overall_scores = []
        grammar_scores = []
        vocabulary_scores = []
        all_strengths = []
        all_areas_to_improve = []
        
        for conversation in conversations:
            # Check for feedback in the new table
            feedback = Session.query(ConversationFeedback).filter_by(
                conversation_id=conversation.id
            ).first()
            
            if feedback:
                if feedback.overall_score:
                    overall_scores.append(feedback.overall_score)
                if feedback.grammar_score:
                    grammar_scores.append(feedback.grammar_score)
                if feedback.vocabulary_score:
                    vocabulary_scores.append(feedback.vocabulary_score)
                
                # Add strengths and areas to improve
                if feedback.main_strengths:
                    try:
                        strengths = json.loads(feedback.main_strengths)
                        all_strengths.extend(strengths)
                    except json.JSONDecodeError:
                        pass
                
                if feedback.areas_to_improve:
                    try:
                        areas = json.loads(feedback.areas_to_improve)
                        all_areas_to_improve.extend(areas)
                    except json.JSONDecodeError:
                        pass
            # For backward compatibility, check the old format
            elif conversation.overall_score:
                overall_scores.append(conversation.overall_score)
                
                # Add strengths and areas to improve
                if conversation.main_strengths:
                    try:
                        strengths = json.loads(conversation.main_strengths)
                        all_strengths.extend(strengths)
                    except json.JSONDecodeError:
                        pass
                
                if conversation.areas_to_improve:
                    try:
                        areas = json.loads(conversation.areas_to_improve)
                        all_areas_to_improve.extend(areas)
                    except json.JSONDecodeError:
                        pass
        
        # Calculate averages and get last 10 scores
        if overall_scores:
            progress_data["conversation"]["overall_score"]["average"] = round(sum(overall_scores) / len(overall_scores), 1)
            progress_data["conversation"]["overall_score"]["last_10"] = overall_scores[:10]
        
        if grammar_scores:
            progress_data["conversation"]["grammar_score"]["average"] = round(sum(grammar_scores) / len(grammar_scores), 1)
            progress_data["conversation"]["grammar_score"]["last_10"] = grammar_scores[:10]
        
        if vocabulary_scores:
            progress_data["conversation"]["vocabulary_score"]["average"] = round(sum(vocabulary_scores) / len(vocabulary_scores), 1)
            progress_data["conversation"]["vocabulary_score"]["last_10"] = vocabulary_scores[:10]
        
        # Get unique strengths and areas to improve (up to 10)
        unique_strengths = []
        for strength in all_strengths:
            if strength not in unique_strengths and len(unique_strengths) < 10:
                unique_strengths.append(strength)
        
        unique_areas = []
        for area in all_areas_to_improve:
            if area not in unique_areas and len(unique_areas) < 10:
                unique_areas.append(area)
        
        progress_data["conversation"]["strengths"] = unique_strengths
        progress_data["conversation"]["areas_to_improve"] = unique_areas
        
        # Get flashcard data
        # Count total flashcards
        total_flashcards = Session.query(func.count(Flashcard.id)).filter(
            Flashcard.user_id == user_id
        ).scalar()
        
        progress_data["flashcards"]["total_flashcards"] = total_flashcards
        
        # Count total topics
        total_topics = Session.query(func.count(distinct(FlashcardGeneration.flashcard_topic))).filter(
            FlashcardGeneration.user_id == user_id
        ).scalar()
        
        # If no topics found, set to 0 instead of None
        if total_topics is None:
            total_topics = 0
            
        progress_data["flashcards"]["total_topics"] = total_topics
        
        # Get word types distribution
        flashcards = Session.query(Flashcard).filter(
            Flashcard.user_id == user_id
        ).all()
        
        word_types = {}
        for flashcard in flashcards:
            if flashcard.additional_info:
                # Try multiple approaches to extract the word type
                word_type = "Unknown"
                
                # First try: Parse as JSON
                try:
                    info = json.loads(flashcard.additional_info)
                    if isinstance(info, dict):
                        # Check for various possible keys that might contain word type
                        for key in ["type", "word_type", "part_of_speech", "pos"]:
                            if key in info and info[key]:
                                word_type = info[key]
                                break
                except (json.JSONDecodeError, AttributeError):
                    pass
                
                # Second try: Look for common patterns in the text
                if word_type == "Unknown":
                    patterns = [
                        r"Type:\s*([^,\n]+)",
                        r"Word type:\s*([^,\n]+)",
                        r"Part of speech:\s*([^,\n]+)",
                        r"POS:\s*([^,\n]+)",
                        r"Grammar:\s*([^,\n]+)"
                    ]
                    
                    for pattern in patterns:
                        match = re.search(pattern, str(flashcard.additional_info), re.IGNORECASE)
                        if match:
                            word_type = match.group(1).strip()
                            break
                
                # Clean up the word type
                word_type = re.sub(r"\s*\([^)]*\)", "", word_type).strip()
                
                # Normalize common word types
                word_type_lower = word_type.lower()
                if word_type_lower in ["noun", "nafnorð", "nafnord"]:
                    word_type = "Noun"
                elif word_type_lower in ["verb", "sagnorð", "sagnord"]:
                    word_type = "Verb"
                elif word_type_lower in ["adjective", "lýsingarorð", "lysingarord"]:
                    word_type = "Adjective"
                elif word_type_lower in ["adverb", "atviksorð", "atviksord"]:
                    word_type = "Adverb"
                elif word_type_lower in ["pronoun", "fornafn"]:
                    word_type = "Pronoun"
                elif word_type_lower in ["preposition", "forsetning"]:
                    word_type = "Preposition"
                elif word_type_lower in ["conjunction", "samtenging"]:
                    word_type = "Conjunction"
                elif word_type_lower in ["interjection", "upphrópun", "upphrópun"]:
                    word_type = "Interjection"
                elif word_type == "Unknown" or not word_type:
                    word_type = "Unknown"
                
                # Add to the count
                if word_type in word_types:
                    word_types[word_type] += 1
                else:
                    word_types[word_type] = 1
        
        # Ensure we have at least one category
        if not word_types:
            word_types["Unknown"] = total_flashcards
            
        progress_data["flashcards"]["word_types"] = word_types
        
        # Get knowledge levels based on next_repetition_space
        for flashcard in flashcards:
            if flashcard.next_repetition_space == 1:
                progress_data["flashcards"]["knowledge_levels"]["unpracticed"] += 1
            elif 2 <= flashcard.next_repetition_space <= 10:
                progress_data["flashcards"]["knowledge_levels"]["recognised"] += 1
            elif 11 <= flashcard.next_repetition_space <= 30:
                progress_data["flashcards"]["knowledge_levels"]["developing"] += 1
            elif 31 <= flashcard.next_repetition_space <= 180:
                progress_data["flashcards"]["knowledge_levels"]["confident"] += 1
            else:  # > 180 days
                progress_data["flashcards"]["knowledge_levels"]["mastered"] += 1
        
        # Get practice streak data
        streaks = Session.query(PracticeStreak).filter(
            PracticeStreak.user_id == user_id
        ).all()
        
        for streak in streaks:
            if streak.practice_type == 'flashcard':
                progress_data["flashcards"]["streak"]["current"] = streak.current_streak
                progress_data["flashcards"]["streak"]["longest"] = streak.longest_streak
            elif streak.practice_type == 'conversation':
                progress_data["conversation"]["streak"]["current"] = streak.current_streak
                progress_data["conversation"]["streak"]["longest"] = streak.longest_streak
        
        # Get due flashcards count
        due_flashcards = Session.query(func.count(Flashcard.id)).filter(
            Flashcard.user_id == user_id,
            Flashcard.next_practice_time <= func.now()
        ).scalar()
        
        progress_data["flashcards"]["streak"]["due_today"] = due_flashcards or 0
        
        return jsonify(progress_data), 200
            
    except Exception as e:
        print(f"Error in get_user_progress: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Add these new API endpoints for practice streaks

@app.route('/users/<int:user_id>/practice-sessions/start', methods=['POST'])
def start_practice_session(user_id):
    """Start a new practice session and record it in the database."""
    try:
        data = request.get_json()
        practice_type = data.get('practice_type')  # 'flashcard' or 'conversation'
        
        if not practice_type or practice_type not in ['flashcard', 'conversation']:
            return jsonify({"error": "Invalid practice type"}), 400
            
        # Create a new practice session
        new_session = PracticeSession(
            user_id=user_id,
            practice_type=practice_type,
            session_data=json.dumps(data.get('session_data', {}))
        )
        
        Session.add(new_session)
        Session.commit()
        
        return jsonify({
            "message": "Practice session started",
            "session_id": new_session.id
        }), 201
        
    except Exception as e:
        logger.error(f"Error starting practice session: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/users/<int:user_id>/practice-sessions/<int:session_id>/complete', methods=['POST'])
def complete_practice_session(user_id, session_id):
    """Complete a practice session and update the user's streak."""
    try:
        # Get the practice session
        practice_session = Session.query(PracticeSession).filter(
            PracticeSession.id == session_id,
            PracticeSession.user_id == user_id
        ).first()
        
        if not practice_session:
            return jsonify({"error": "Practice session not found"}), 404
            
        if practice_session.completed_at:
            return jsonify({"error": "Practice session already completed"}), 400
            
        # Mark the session as completed
        practice_session.completed_at = datetime.now()
        
        # Get or create the practice streak record
        practice_streak = Session.query(PracticeStreak).filter(
            PracticeStreak.user_id == user_id,
            PracticeStreak.practice_type == practice_session.practice_type
        ).first()
        
        if not practice_streak:
            # Create a new streak record
            practice_streak = PracticeStreak(
                user_id=user_id,
                practice_type=practice_session.practice_type,
                current_streak=1,
                longest_streak=1,
                last_practice_date=datetime.now()
            )
            Session.add(practice_streak)
        else:
            # Check if the streak should be updated
            today = datetime.now().date()
            
            if practice_streak.last_practice_date:
                last_practice_date = practice_streak.last_practice_date.date()
                
                # If already practiced today, don't update streak
                if last_practice_date == today:
                    pass
                # If practiced yesterday, increment streak
                elif last_practice_date == today - timedelta(days=1):
                    practice_streak.current_streak += 1
                    # Update longest streak if current streak is longer
                    if practice_streak.current_streak > practice_streak.longest_streak:
                        practice_streak.longest_streak = practice_streak.current_streak
                # If missed a day, reset streak to 1
                else:
                    practice_streak.current_streak = 1
            else:
                # First time practicing
                practice_streak.current_streak = 1
                
            # Update last practice date
            practice_streak.last_practice_date = datetime.now()
        
        Session.commit()
        
        return jsonify({
            "message": "Practice session completed",
            "current_streak": practice_streak.current_streak,
            "longest_streak": practice_streak.longest_streak
        }), 200
        
    except Exception as e:
        logger.error(f"Error completing practice session: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/users/<int:user_id>/practice-streaks', methods=['GET'])
def get_practice_streaks(user_id):
    """Get the user's practice streaks for both flashcard and conversation practice."""
    try:
        # Get the user's practice streaks
        streaks = Session.query(PracticeStreak).filter(
            PracticeStreak.user_id == user_id
        ).all()
        
        # Initialize response with default values
        streak_data = {
            "flashcard": {
                "current_streak": 0,
                "longest_streak": 0,
                "last_practice_date": None
            },
            "conversation": {
                "current_streak": 0,
                "longest_streak": 0,
                "last_practice_date": None
            }
        }
        
        # Update with actual streak data
        for streak in streaks:
            practice_type = streak.practice_type
            last_practice_date = None
            
            if streak.last_practice_date:
                last_practice_date = streak.last_practice_date.isoformat()
                
            streak_data[practice_type] = {
                "current_streak": streak.current_streak,
                "longest_streak": streak.longest_streak,
                "last_practice_date": last_practice_date
            }
        
        return jsonify(streak_data), 200
        
    except Exception as e:
        logger.error(f"Error getting practice streaks: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/text-to-speech', methods=['POST'])
def text_to_speech():
    """Generate audio for Icelandic text using Google Cloud TTS"""
    try:
        data = request.get_json()
        text = data.get('text')
        
        logger.info(f"Text-to-speech request received for text: {text}")
        
        if not text:
            logger.warning("Text-to-speech: No text provided")
            return jsonify({"error": "No text provided"}), 400
            
        if not GOOGLE_API_KEY:
            logger.error("Text-to-speech: Google API key not configured")
            return jsonify({"error": "Google API key not configured"}), 500
        
        # Create request to the Google Text-to-Speech API
        url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={GOOGLE_API_KEY}"
        
        logger.info(f"Making request to Google TTS API for text: {text}")
        
        payload = {
            "input": {"text": text},
            "voice": {"languageCode": "is-IS", "ssmlGender": "NEUTRAL"},
            "audioConfig": {"audioEncoding": "MP3", "speakingRate": 0.9}
        }
        
        response = requests.post(url, json=payload)
        
        if response.status_code != 200:
            logger.error(f"Google API error: Status {response.status_code}, Response: {response.text}")
            return jsonify({"error": f"Failed to generate speech. Google API returned status {response.status_code}"}), 500
        
        # The response contains audioContent as base64
        try:
            audio_content = response.json().get("audioContent")
            if not audio_content:
                logger.error("Google API returned no audio content")
                return jsonify({"error": "No audio content received from Google API"}), 500
                
            logger.info("Successfully generated audio from text")
            return jsonify({
                "audio": audio_content,
                "text": text
            }), 200
            
        except Exception as json_err:
            logger.error(f"Error extracting JSON from Google API response: {str(json_err)}")
            return jsonify({"error": "Failed to parse Google API response"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error in text-to-speech: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/test-google-tts', methods=['GET'])
def test_google_tts():
    """Test the Google Text-to-Speech API connection"""
    try:
        if not GOOGLE_API_KEY:
            return jsonify({
                "status": "error",
                "message": "GOOGLE_API_KEY is not set",
                "api_key_found": False
            }), 400
        
        # Try a simple test request to validate the API key
        url = f"https://texttospeech.googleapis.com/v1/voices?key={GOOGLE_API_KEY}"
        response = requests.get(url)
        
        if response.status_code == 200:
            return jsonify({
                "status": "success",
                "message": "Google TTS API connection successful",
                "api_key_found": True,
                "api_response_status": response.status_code
            }), 200
        else:
            return jsonify({
                "status": "error",
                "message": f"Google TTS API returned error: {response.status_code}",
                "api_key_found": True,
                "api_response_status": response.status_code,
                "response_text": response.text[:200] + ("..." if len(response.text) > 200 else "")
            }), 400
            
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Exception when testing Google TTS API: {str(e)}",
            "api_key_found": GOOGLE_API_KEY is not None
        }), 500

@app.route('/users/<int:user_id>/save-challenging-word', methods=['POST'])
def save_challenging_word(user_id):
    """Save a challenging word from conversation feedback to user's flashcard library."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Extract word data
        icelandic = data.get('icelandic')
        english = data.get('english')
        part_of_speech = data.get('part_of_speech')
        note = data.get('note')
        topic = data.get('topic', 'Conversation Words')  # Default topic if none provided
        
        logger.info(f"Saving challenging word for user {user_id}: {icelandic} - {english}")

        if not icelandic or not english:
            return jsonify({"error": "Missing required fields: icelandic and english"}), 400

        # Find or create library for conversation words
        library = (Session.query(FlashcardLibrary)
                  .filter_by(user_id=user_id, library_name=topic)
                  .first())
        
        if not library:
            logger.info(f"Creating new library: {topic}")
            library = FlashcardLibrary(
                user_id=user_id,
                library_name=topic
            )
            Session.add(library)
            Session.commit()  # Commit to get the library ID
            logger.info(f"Created library with ID: {library.id}")

        # Format additional info
        additional_info = part_of_speech or ""
        if note:
            additional_info += ("; " if additional_info else "") + note

        # Create new flashcard
        new_card = Flashcard(
            user_id=user_id,
            library_id=library.id,
            front_text=english,  # English on front
            back_text=icelandic,  # Icelandic on back
            additional_info=additional_info,
            next_repetition_space=1,  # Initial repetition space is 1 day
            next_practice_time=func.now()  # Initial practice time is now (immediately available)
        )
        
        Session.add(new_card)
        Session.commit()
        logger.info(f"Successfully saved challenging word to flashcard with ID: {new_card.id}")
        
        return jsonify({
            "message": "Word saved to flashcard library successfully",
            "flashcard_id": new_card.id,
            "library_name": topic
        }), 200

    except Exception as e:
        logger.error(f"Error saving challenging word: {str(e)}")
        Session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/conversation_feedback/<conversation_id>', methods=['GET'])
def get_conversation_feedback_by_id(conversation_id):
    try:
        # Log the request parameters for debugging
        logger.info(f"Getting feedback for conversation_id: {conversation_id}")
        
        # Query the feedback from the database
        feedback = Session.query(ConversationFeedback).filter_by(
            conversation_id=conversation_id
        ).first()
        
        if not feedback:
            logger.warning(f"No feedback found for conversation: {conversation_id}")
            return jsonify({"error": "No feedback found for this conversation"}), 404
        
        logger.info(f"Found feedback for conversation: {conversation_id}")
        
        # Parse the JSON stored in the database
        main_strengths = json.loads(feedback.main_strengths) if feedback.main_strengths else []
        areas_to_improve = json.loads(feedback.areas_to_improve) if feedback.areas_to_improve else []
        
        # Process challenging words - handle both formats for compatibility
        challenging_words = []
        challenging_words_table = None
        
        if feedback.challenging_words:
            try:
                logger.info(f"Raw challenging_words from DB: {feedback.challenging_words}")
                challenging_words = json.loads(feedback.challenging_words)
                logger.info(f"Successfully parsed challenging_words: found {len(challenging_words)} words")
                
                # Log each challenging word for debugging
                for i, word in enumerate(challenging_words):
                    logger.info(f"Word {i+1}: {word}")
                
                # Create the table format for backward compatibility
                challenging_words_table = {
                    "headers": ["Icelandic", "English", "Part of Speech", "Notes"],
                    "rows": []
                }
                
                for word in challenging_words:
                    row = [
                        word.get("icelandic", ""),
                        word.get("english", ""),
                        word.get("part_of_speech", ""),
                        word.get("note", "")
                    ]
                    challenging_words_table["rows"].append(row)
                
                logger.info(f"Created challenging_words_table with {len(challenging_words_table['rows'])} rows")
                
            except json.JSONDecodeError as e:
                logger.error(f"Error parsing challenging_words JSON: {str(e)}")
                challenging_words = []
        else:
            logger.warning("No challenging_words found in feedback")
        
        # Construct the response
        response = {
            "feedback_summary": feedback.feedback_summary,
            "main_strengths": main_strengths,
            "areas_to_improve": areas_to_improve,
            "grammar_score": feedback.grammar_score,
            "vocabulary_score": feedback.vocabulary_score,
            "overall_score": feedback.overall_score,
            "challenging_words": challenging_words,  # Raw format (new clients)
            "challenging_words_table": challenging_words_table  # Table format (legacy clients)
        }
        
        logger.info(f"Returning feedback response with {len(challenging_words)} challenging words")
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Error in get_conversation_feedback_by_id: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/submit-feedback', methods=['POST'])
def submit_feedback():
    try:
        # Get the data from the request
        data = request.json
        
        if not data or not isinstance(data, dict):
            return jsonify({'success': False, 'message': 'Invalid request data'}), 400
            
        # Extract data from the request
        user_id = data.get('userId', 'anonymous')
        feedback_type = data.get('feedbackType', '')
        feedback_text = data.get('feedbackText', '')
        
        if not feedback_type or not feedback_text:
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400
        
        print(f"Received feedback - Type: {feedback_type}, Text: {feedback_text}, User: {user_id}")
        
        # Get database connection
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from models import Feedback, Base
        
        # Create the table if it doesn't exist
        engine = create_engine('sqlite:///icelandic_learning.db')
        Base.metadata.create_all(engine, tables=[Feedback.__table__])
        
        Session = sessionmaker(bind=engine)
        db = Session()
        
        try:
            # Create new feedback record
            new_feedback = Feedback(
                user_id=user_id,
                feedback_type=feedback_type,
                feedback_text=feedback_text
            )
            
            # Save to database
            db.add(new_feedback)
            db.commit()
            
            return jsonify({'success': True, 'message': 'Feedback submitted successfully'}), 200
        finally:
            db.close()
    
    except Exception as e:
        import traceback
        print(f"Error processing feedback: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'message': 'Server error processing feedback'}), 500

@app.route('/admin/feedback', methods=['GET'])
def view_feedback():
    try:
        # Simple token check
        admin_token = request.args.get('token')
        if admin_token != '97f574c20ae895444a3b983e2973f191':
            return jsonify({'error': 'Unauthorized'}), 401
        
        # Get all feedback entries
        from sqlalchemy import desc
        from models import Feedback
        
        # Use your existing database session pattern
        # If you have db = get_db(), use that. Otherwise, create session directly:
        
        # For direct session approach:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        
        # Use same engine config as in your main application
        if 'DATABASE_URL' in os.environ:
            db_url = os.environ['DATABASE_URL']
            # Fix for Heroku/Render Postgres URLs
            if db_url.startswith('postgres://'):
                db_url = db_url.replace('postgres://', 'postgresql://', 1)
            engine = create_engine(db_url)
        else:
            engine = create_engine('sqlite:///icelandic_learning.db')
            
        Session = sessionmaker(bind=engine)
        db = Session()
        
        try:
            feedback_entries = db.query(Feedback).order_by(desc(Feedback.created_at)).all()
            
            # Convert to dictionaries for display
            feedback_list = []
            for entry in feedback_entries:
                feedback_list.append({
                    'id': entry.id,
                    'user_id': entry.user_id,
                    'feedback_type': entry.feedback_type,
                    'feedback_text': entry.feedback_text,
                    'created_at': entry.created_at.isoformat() if entry.created_at else None
                })
            
            # Generate HTML response
            html = '''
            <!DOCTYPE html>
            <html>
            <head>
                <title>Feedback Dashboard</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background-color: #4CAF50; color: white; }
                    tr:nth-child(even) { background-color: #f2f2f2; }
                    .container { max-width: 1200px; margin: 0 auto; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Feedback Dashboard</h1>
            '''
            
            if not feedback_list:
                html += '<p>No feedback entries found.</p>'
            else:
                html += f'<p>Total feedback entries: {len(feedback_list)}</p>'
                html += '''
                    <table>
                        <tr>
                            <th>ID</th>
                            <th>User ID</th>
                            <th>Type</th>
                            <th>Text</th>
                            <th>Date</th>
                        </tr>
                '''
                
                for entry in feedback_list:
                    html += f'''
                        <tr>
                            <td>{entry["id"]}</td>
                            <td>{entry["user_id"]}</td>
                            <td>{entry["feedback_type"]}</td>
                            <td>{entry["feedback_text"]}</td>
                            <td>{entry["created_at"]}</td>
                        </tr>
                    '''
                
                html += '</table>'
            
            html += '''
                </div>
            </body>
            </html>
            '''
            
            return html
            
        finally:
            db.close()
            
    except Exception as e:
        import traceback
        print(f"Error retrieving feedback: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve feedback'}), 500

# Add this with other prompts
SUGGESTED_SCENARIOS_PROMPT = """You are part of a language learning app. Your role is to generate brief suggested conversation prompts that the user can click on to practice Icelandic.

User Profile:
- Skill Level: {USER_SKILL_LEVEL}
- Profession: {USER_PROFESSION}
- Hobbies: {USER_HOBBIES}
- Interests: {USER_INTERESTS}
- Gender: {USER_GENDER}

Based on the user's profile above, suggest 6 short, simple conversation scenarios that would be helpful and relevant for this user to practice Icelandic. Each prompt should be a short sentence. For example, if one of the user's interests was football, you could suggest "Going to watch a football match".

Your response MUST be EXACTLY in this JSON format - nothing else:

{{
    "suggested_scenarios": [
        "Short scenario prompt 1",
        "Short scenario prompt 2",
        "Short scenario prompt 3",
        "Short scenario prompt 4",
        "Short scenario prompt 5",
        "Short scenario prompt 6"
    ]
}}

CRITICAL REQUIREMENTS:
1. NO preamble text before the JSON
2. NO explanation text after the JSON
3. NO markdown code blocks (```)
4. Absolutely NO extra text of ANY kind - just the raw JSON
5. Start with '{{' character and end with '}}' character
6. Make sure it's valid JSON (proper quotes, commas, no trailing commas)
7. Each scenario must be a simple string, not an object
8. You MUST provide exactly 6 scenarios

I will parse your response directly as JSON, so ANY deviation from this format will cause errors.
"""

@app.route('/suggested-conversation-scenarios', methods=['POST'])
def get_suggested_scenarios():
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        # For testing - return fixed scenarios without calling Claude
        test_mode = data.get('test_mode', False)
        if test_mode:
            logger.info("Test mode activated - returning hardcoded scenarios")
            return jsonify({
                "message": "Test scenarios generated successfully",
                "suggested_scenarios": [
                    "Going to a coffee shop",
                    "Shopping for groceries", 
                    "Meeting a new friend"
                ]
            }), 200

        if not user_id:
            return jsonify({"error": "Missing required field: user_id"}), 400

        # Get user profile from database
        user = Session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Create personalized system prompt using user profile
        personalized_prompt = SUGGESTED_SCENARIOS_PROMPT.format(
            USER_SKILL_LEVEL=user.skill_level or "beginner",
            USER_PROFESSION=user.profession or "general",
            USER_HOBBIES=user.hobbies or "general",
            USER_INTERESTS=user.interests or "general",
            USER_GENDER=user.gender or "neutral"
        )

        try:
            # Generate suggestions using Claude
            client = Anthropic(api_key=API_KEY)
            
            logger.info(f"Sending suggested scenarios prompt to Claude for user {user_id}")

            # Define user message outside the API call for clarity
            user_message = "Return a JSON object with suggested conversation scenarios. Your entire response MUST be a single valid JSON object starting with '{' and ending with '}'. No additional text, comments, or explanations before or after the JSON. The format must exactly match: {\"suggested_scenarios\": [\"scenario 1\", \"scenario 2\", \"scenario 3\", \"scenario 4\", \"scenario 5\", \"scenario 6\"]}"
            
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1000,
                temperature=0.9,  # Increased temperature for more varied responses
                system=personalized_prompt,
                messages=[{
                    "role": "user",
                    "content": user_message
                }]
            )

            # Extract response text using the same method as successful endpoints
            response_text = ""
            if hasattr(response, 'content') and isinstance(response.content, list) and response.content:
                first_content = response.content[0]
                if hasattr(first_content, 'text'):
                    response_text = first_content.text
                    logger.info(f"Successfully extracted text from response (length: {len(response_text)})")
                    logger.info(f"Response starts with: '{response_text[:50]}...'")
                    logger.info(f"Response ends with: '...{response_text[-50:]}'")
            
            # Fallback response in case of parsing errors
            fallback_scenarios = [
                "Going to a coffee shop",
                "Shopping for groceries",
                "Meeting a new friend",
                "Asking for directions",
                "Ordering food at a restaurant",
                "Talking about the weather"
            ]

            # Simple JSON parsing similar to the successful flashcard endpoint
            try:
                # Clean the response text
                cleaned_text = response_text.strip()
                logger.info(f"Cleaned text (length: {len(cleaned_text)})")
                
                # Parse as JSON directly
                scenarios_data = json.loads(cleaned_text)
                
                # Validate the structure
                if 'suggested_scenarios' in scenarios_data and isinstance(scenarios_data['suggested_scenarios'], list):
                    logger.info(f"Successfully parsed JSON: {scenarios_data}")
                    return jsonify({
                        "message": "Scenario suggestions generated successfully",
                        "suggested_scenarios": scenarios_data['suggested_scenarios']
                    }), 200
                else:
                    logger.error(f"Missing 'suggested_scenarios' key in response: {scenarios_data}")
                    return jsonify({
                        "message": "Generated fallback scenarios (missing key)",
                        "suggested_scenarios": fallback_scenarios
                    }), 200
                
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error: {str(e)}")
                
                # If we can't parse the JSON directly, try fix_json
                try:
                    # Helper function to fix common JSON issues
                    def try_fix_json(json_str):
                        # Fix missing quotes around keys
                        fixed_str = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)', r'\1"\2"\3', json_str)
                        # Fix single quotes being used instead of double quotes
                        fixed_str = fixed_str.replace("'", '"')
                        # Fix trailing commas in arrays or objects
                        fixed_str = re.sub(r',\s*([}\]])', r'\1', fixed_str)
                        return fixed_str
                    
                    fixed_json = try_fix_json(cleaned_text)
                    logger.info(f"Attempting to parse fixed JSON: {fixed_json}")
                    
                    scenarios_data = json.loads(fixed_json)
                    
                    if 'suggested_scenarios' in scenarios_data and isinstance(scenarios_data['suggested_scenarios'], list):
                        logger.info(f"Successfully parsed fixed JSON: {scenarios_data}")
                        return jsonify({
                            "message": "Scenario suggestions generated successfully (after fixing)",
                            "suggested_scenarios": scenarios_data['suggested_scenarios']
                        }), 200
                except Exception as fix_error:
                    logger.error(f"Error fixing JSON: {str(fix_error)}")
                
                # Return fallback if all parsing attempts fail
                return jsonify({
                    "message": "Generated fallback scenarios (parsing failed)",
                    "suggested_scenarios": fallback_scenarios
                }), 200

        except Exception as e:
            logger.error(f"Error generating scenario suggestions: {str(e)}")
            return jsonify({
                "message": "Generated fallback scenarios (API error)",
                "suggested_scenarios": fallback_scenarios
            }), 200

    except Exception as e:
        logger.error(f"Unexpected error in get_suggested_scenarios: {str(e)}")
        return jsonify({
            "message": "Generated fallback scenarios (unexpected error)", 
            "suggested_scenarios": [
                "Going to a coffee shop",
                "Shopping for groceries",
                "Meeting a new friend",
                "Asking for directions",
                "Ordering food at a restaurant",
                "Talking about the weather"
            ]
        }), 200

# Test endpoint for directly testing the suggested scenarios functionality
@app.route('/test-suggested-scenarios/<int:user_id>', methods=['GET'])
def test_suggested_scenarios(user_id):
    """
    Test endpoint to directly check the suggested scenarios functionality for a specific user.
    This can be helpful for debugging without going through the UI.
    """
    logger.info(f"Test endpoint called for user ID: {user_id}")
    
    # Call the actual implementation with the provided user ID
    try:
        # Get user profile from database
        user = Session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        # Create personalized system prompt using user profile
        personalized_prompt = SUGGESTED_SCENARIOS_PROMPT.format(
            USER_SKILL_LEVEL=user.skill_level or "beginner",
            USER_PROFESSION=user.profession or "general",
            USER_HOBBIES=user.hobbies or "general",
            USER_INTERESTS=user.interests or "general",
            USER_GENDER=user.gender or "neutral"
        )
        
        # Display the prompt that will be sent to Claude
        logger.info(f"Test prompt: {personalized_prompt}")
        
        client = Anthropic(api_key=API_KEY)
        
        logger.info(f"Sending test prompt to Claude for user {user_id}")
        
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            temperature=0.2,
            system=personalized_prompt,
            messages=[{
                "role": "user",
                "content": "Return ONLY a raw JSON object with 6 conversation scenarios. The JSON must start with '{' and end with '}' with NO other text, formatting, or explanation. Format: {\"suggested_scenarios\": [\"scenario 1\", \"scenario 2\", \"scenario 3\", \"scenario 4\", \"scenario 5\", \"scenario 6\"]}"
            }]
        )
        
        # Extract response text
        response_text = ""
        if hasattr(response, 'content'):
            if isinstance(response.content, list) and response.content:
                first_content = response.content[0]
                if hasattr(first_content, 'text'):
                    response_text = first_content.text
        
        # Enhanced error analysis for the test endpoint
        result = {
            "raw_response": response_text,
            "response_length": len(response_text),
            "first_char": response_text[0] if response_text else None,
            "first_10_chars": response_text[:10] if len(response_text) >= 10 else response_text,
            "last_10_chars": response_text[-10:] if len(response_text) >= 10 else response_text,
            "starts_with_brace": response_text.startswith('{') if response_text else False,
            "ends_with_brace": response_text.endswith('}') if response_text else False,
            "contains_suggested_scenarios": "suggested_scenarios" in response_text,
            "test_result": "This is the raw response from Claude for debugging purposes."
        }
        
        # Add debugging information
        debug_info = {
            "user_info": {
                "skill_level": user.skill_level or "beginner",
                "profession": user.profession or "general",
                "hobbies": user.hobbies or "general",
                "interests": user.interests or "general",
                "gender": user.gender or "neutral"
            }
        }
        
        # Try parsing with our improved methods to see what works
        try:
            # Helper function to attempt to fix common JSON issues
            def try_fix_json(json_str):
                # Fix missing quotes around keys
                fixed_str = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)', r'\1"\2"\3', json_str)
                
                # Fix single quotes being used instead of double quotes
                fixed_str = fixed_str.replace("'", '"')
                
                # Fix trailing commas in arrays or objects
                fixed_str = re.sub(r',\s*([}\]])', r'\1', fixed_str)
                
                return fixed_str
            
            parsing_results = {
                "direct_parse": False,
                "fixed_json_parse": False,
                "regex_extraction": False,
                "scenarios_found": []
            }
            
            # 1. Try direct parsing
            try:
                direct_parse = json.loads(response_text)
                parsing_results["direct_parse"] = True
                if "suggested_scenarios" in direct_parse:
                    parsing_results["scenarios_found"] = direct_parse["suggested_scenarios"]
            except Exception as e:
                parsing_results["direct_parse_error"] = str(e)
            
            # 2. Try fixed JSON parsing
            if not parsing_results["direct_parse"]:
                try:
                    fixed_json = try_fix_json(response_text)
                    fixed_parse = json.loads(fixed_json)
                    parsing_results["fixed_json_parse"] = True
                    if "suggested_scenarios" in fixed_parse:
                        parsing_results["scenarios_found"] = fixed_parse["suggested_scenarios"]
                except Exception as e:
                    parsing_results["fixed_json_error"] = str(e)
            
            # 3. Try regex extraction
            if not parsing_results["scenarios_found"]:
                # Find any JSON-like structure
                json_match = re.search(r'(\{.*\})', response_text, re.DOTALL)
                if json_match:
                    potential_json = json_match.group(1)
                    try:
                        regex_parse = json.loads(potential_json)
                        parsing_results["regex_extraction"] = True
                        if "suggested_scenarios" in regex_parse:
                            parsing_results["scenarios_found"] = regex_parse["suggested_scenarios"]
                    except Exception as e:
                        parsing_results["regex_error"] = str(e)
            
            # 4. Try pattern matching
            if not parsing_results["scenarios_found"]:
                scenario_pattern = r'"([^"]+)"'  # Match anything in quotes
                matches = re.findall(scenario_pattern, response_text)
                if matches:
                    filtered_scenarios = [m for m in matches if 5 <= len(m) <= 100 and ' ' in m]
                    if filtered_scenarios:
                        parsing_results["pattern_matching"] = True
                        parsing_results["scenarios_found"] = filtered_scenarios[:6]
            
            result["parsing_results"] = parsing_results
            
        except Exception as e:
            result["parsing_error"] = str(e)
        
        result["debug_info"] = debug_info
        
        return jsonify(result), 200
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        logger.error(f"Error in test endpoint: {str(e)}\n{error_traceback}")
        return jsonify({
            "error": f"Test failed: {str(e)}",
            "traceback": error_traceback
        }), 500

# Test endpoint for directly testing the suggested scenarios functionality
@app.route('/test-scenarios-static', methods=['GET'])
def test_scenarios_static():
    """
    A simpler test endpoint that returns static scenarios without calling Claude.
    This is useful to verify that the frontend can properly receive and display scenarios.
    """
    return jsonify({
        "message": "Test scenarios generated successfully",
        "suggested_scenarios": [
            "Going to a coffee shop in Reykjavik",
            "Asking for directions to the Blue Lagoon",
            "Ordering traditional Icelandic food at a restaurant",
            "Discussing the Northern Lights",
            "Shopping for souvenirs in downtown Reykjavik",
            "Introducing yourself to locals at a community event"
        ]
    }), 200

# Test endpoint for directly testing the suggested scenarios functionality
@app.route('/test-scenarios-raw/<int:user_id>', methods=['GET'])
def test_scenarios_raw(user_id):
    """
    A simpler test endpoint that focuses specifically on the raw Claude output.
    This makes it easier to debug whether the issue is with Claude's response or the parsing logic.
    """
    logger.info(f"Raw test endpoint called for user ID: {user_id}")
    
    try:
        # Get user profile from database
        user = Session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        # Create personalized system prompt using user profile - use double braces to escape them
        personalized_prompt = SUGGESTED_SCENARIOS_PROMPT.format(
            USER_SKILL_LEVEL=user.skill_level or "beginner",
            USER_PROFESSION=user.profession or "general",
            USER_HOBBIES=user.hobbies or "general",
            USER_INTERESTS=user.interests or "general",
            USER_GENDER=user.gender or "neutral"
        )
        
        logger.info(f"Sending prompt to Claude for user {user_id}")
        
        # Define the user message with the format already escaped
        user_message = "Return a JSON object with suggested conversation scenarios. Your entire response MUST be a single valid JSON object starting with '{' and ending with '}'. No additional text, comments, or explanations before or after the JSON. The format must exactly match: {\"suggested_scenarios\": [\"scenario 1\", \"scenario 2\", \"scenario 3\", \"scenario 4\", \"scenario 5\", \"scenario 6\"]}"
        
        client = Anthropic(api_key=API_KEY)
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            temperature=0.2,
            system=personalized_prompt,
            messages=[{
                "role": "user",
                "content": user_message
            }]
        )
        
        # Extract response text
        response_text = ""
        if hasattr(response, 'content'):
            if isinstance(response.content, list) and response.content:
                first_content = response.content[0]
                if hasattr(first_content, 'text'):
                    response_text = first_content.text
        
        # Simple HTML display to make it easy to view the response
        html_response = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Raw Claude Response</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                h1 {{ color: #333; }}
                .response-container {{ 
                    background-color: #f5f5f5; 
                    padding: 15px; 
                    border: 1px solid #ddd; 
                    border-radius: 5px;
                    margin: 20px 0;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }}
                .char-analysis {{ 
                    background-color: #e8f4f8; 
                    padding: 15px; 
                    border: 1px solid #b8d6e6; 
                    border-radius: 5px;
                    margin: 20px 0;
                    overflow-x: auto;
                }}
                .debug-info {{
                    margin-top: 20px;
                    padding: 10px;
                    background-color: #fff8e1;
                    border: 1px solid #ffe082;
                    border-radius: 5px;
                }}
                .json-parse-test {{
                    margin-top: 20px;
                    padding: 10px;
                    background-color: #e8f5e9;
                    border: 1px solid #a5d6a7;
                    border-radius: 5px;
                }}
                table {{ border-collapse: collapse; width: 100%; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #f2f2f2; }}
            </style>
        </head>
        <body>
            <h1>Raw Claude Response</h1>
            
            <h2>Response Text (Length: {len(response_text)})</h2>
            <div class="response-container">{response_text}</div>
            
            <h2>Character Analysis (First 50 characters)</h2>
            <div class="char-analysis">
                <table>
                    <tr>
                        <th>Position</th>
                        <th>Character</th>
                        <th>ASCII/Unicode</th>
                    </tr>
        """
        
        # Add first 50 characters to the table
        for i, char in enumerate(response_text[:50]):
            html_response += f"""
                    <tr>
                        <td>{i}</td>
                        <td>'{char}'</td>
                        <td>{ord(char)}</td>
                    </tr>
            """
        
        # Add JSON parse test
        html_response += """
                </table>
            </div>
            
            <h2>JSON Parse Test</h2>
            <div class="json-parse-test">
        """
        
        # Try to parse the JSON
        try:
            parsed_json = json.loads(response_text)
            html_response += f"""
                <p style="color: green">✓ Successfully parsed as JSON</p>
                <h3>Parsed Content:</h3>
                <pre>{json.dumps(parsed_json, indent=4)}</pre>
            """
            
            # Check for suggested_scenarios
            if "suggested_scenarios" in parsed_json:
                html_response += f"""
                <p style="color: green">✓ Contains 'suggested_scenarios' key</p>
                <h3>Suggested Scenarios:</h3>
                <ul>
                """
                
                for scenario in parsed_json["suggested_scenarios"]:
                    html_response += f"<li>{scenario}</li>"
                
                html_response += "</ul>"
            else:
                html_response += '<p style="color: red">✗ Missing \'suggested_scenarios\' key</p>'
            
        except json.JSONDecodeError as e:
            html_response += f"""
                <p style="color: red">✗ Failed to parse as JSON</p>
                <p>Error: {str(e)}</p>
                
                <h3>Possible Fixes:</h3>
            """
            
            # Try different fixes
            fixes_attempted = []
            
            # Fix 1: Try with stripped text
            fixes_attempted.append(("Stripped whitespace", response_text.strip()))
            
            # Fix 2: Try with regex extraction
            json_match = re.search(r'(\{.*\})', response_text, re.DOTALL)
            if json_match:
                fixes_attempted.append(("Regex extraction", json_match.group(1)))
            
            # Fix 3: Try with the helper function
            def try_fix_json(json_str):
                # Fix missing quotes around keys
                fixed_str = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)', r'\1"\2"\3', json_str)
                
                # Fix single quotes being used instead of double quotes
                fixed_str = fixed_str.replace("'", '"')
                
                # Fix trailing commas in arrays or objects
                fixed_str = re.sub(r',\s*([}\]])', r'\1', fixed_str)
                
                return fixed_str
            
            fixes_attempted.append(("Fixed JSON", try_fix_json(response_text)))
            
            # Try each fix
            for fix_name, fixed_text in fixes_attempted:
                try:
                    parsed_json = json.loads(fixed_text)
                    html_response += f"""
                    <div style="margin: 10px 0; padding: 10px; background-color: #e8f5e9; border: 1px solid #a5d6a7;">
                        <p style="color: green">✓ Successfully parsed with: {fix_name}</p>
                        <pre>{json.dumps(parsed_json, indent=4)}</pre>
                    </div>
                    """
                except json.JSONDecodeError:
                    html_response += f"""
                    <div style="margin: 10px 0; padding: 10px; background-color: #ffebee; border: 1px solid #ffcdd2;">
                        <p style="color: red">✗ Failed with: {fix_name}</p>
                    </div>
                    """
        
        # Close the HTML
        html_response += """
            </div>
        </body>
        </html>
        """
        
        return html_response, 200, {'Content-Type': 'text/html'}
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        logger.error(f"Error in raw test endpoint: {str(e)}\n{error_traceback}")
        
        error_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Error in Raw Test</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                h1 {{ color: #d32f2f; }}
                .error-container {{ 
                    background-color: #ffebee; 
                    padding: 15px; 
                    border: 1px solid #ffcdd2; 
                    border-radius: 5px;
                    margin: 20px 0;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }}
            </style>
        </head>
        <body>
            <h1>Error Occurred</h1>
            <div class="error-container">
                <h2>Error Message:</h2>
                <p>{str(e)}</p>
                
                <h2>Traceback:</h2>
                <pre>{error_traceback}</pre>
            </div>
        </body>
        </html>
        """
        
        return error_html, 500, {'Content-Type': 'text/html'}

# Test endpoint for directly testing the suggested scenarios functionality
@app.route('/test-scenarios-direct', methods=['GET'])
def test_scenarios_direct():
    """
    Direct test endpoint that retrieves scenarios using just the JSON parsing part.
    """
    try:
        # Use a minimal example for testing
        example_json = {
            "suggested_scenarios": [
                "Going to a coffee shop to practice ordering in Icelandic",
                "Asking for directions to the nearest bookstore",
                "Introducing yourself to a new Icelandic friend",
                "Discussing Icelandic literature with a local",
                "Shopping for groceries at the supermarket",
                "Talking about the weather and natural attractions"
            ]
        }
        
        # Return a simple JSON response directly
        return jsonify({
            "message": "Direct scenarios test",
            "suggested_scenarios": example_json["suggested_scenarios"]
        }), 200
    except Exception as e:
        logger.error(f"Error in direct test: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/test-scenarios-claude', methods=['POST'])
def test_scenarios_claude():
    """
    Test endpoint for simplified Claude integration.
    """
    try:
        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({"error": "Missing required field: user_id"}), 400

        # Get user profile from database
        user = Session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Create personalized system prompt using user profile
        personalized_prompt = SUGGESTED_SCENARIOS_PROMPT.format(
            USER_SKILL_LEVEL=user.skill_level or "beginner",
            USER_PROFESSION=user.profession or "general",
            USER_HOBBIES=user.hobbies or "general",
            USER_INTERESTS=user.interests or "general",
            USER_GENDER=user.gender or "neutral"
        )

        # Generate suggestions using Claude
        client = Anthropic(api_key=API_KEY)
        
        logger.info(f"Sending simplified test prompt to Claude for user {user_id}")

        # Define user message outside the API call
        user_message = "Return a JSON object with suggested conversation scenarios. The format must be {\"suggested_scenarios\": [\"scenario 1\", \"scenario 2\", \"scenario 3\", \"scenario 4\", \"scenario 5\", \"scenario 6\"]}"
        
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            temperature=0.2,
            system=personalized_prompt,
            messages=[{
                "role": "user",
                "content": user_message
            }]
        )

        # Simple response text extraction
        response_text = ""
        if hasattr(response, 'content'):
            if isinstance(response.content, list) and response.content:
                first_content = response.content[0]
                if hasattr(first_content, 'text'):
                    response_text = first_content.text
        
        logger.info(f"Raw response: {response_text}")
        
        # Very simple JSON parsing - just try to load it directly
        try:
            # Clean the response text and parse JSON
            cleaned_text = response_text.strip()
            scenarios_data = json.loads(cleaned_text)
            
            if 'suggested_scenarios' in scenarios_data:
                return jsonify({
                    "message": "Test scenarios generated successfully",
                    "suggested_scenarios": scenarios_data['suggested_scenarios'],
                    "debug_info": {
                        "raw_response": response_text,
                        "cleaned_text": cleaned_text
                    }
                }), 200
            else:
                return jsonify({
                    "error": "Response does not contain suggested_scenarios key",
                    "debug_info": {
                        "raw_response": response_text,
                        "parsed_data": scenarios_data
                    }
                }), 500
        except json.JSONDecodeError as e:
            return jsonify({
                "error": f"Failed to parse JSON: {str(e)}",
                "debug_info": {
                    "raw_response": response_text,
                    "extract_attempt": response_text[:100] + "..." + response_text[-100:] if len(response_text) > 200 else response_text
                }
            }), 500
    
    except Exception as e:
        logger.error(f"Error in test endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

# ---------------------------
# Main Entry Point
# ---------------------------
if __name__ == '__main__':
    # Use environment variable for port with a default of 5000
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
