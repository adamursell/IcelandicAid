import os
import json
import logging
import sys
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

# ---------------------------
# Logging Configuration
# ---------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
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
    created_at = Column(TIMESTAMP, server_default=func.now())

class Flashcard(Base):
    __tablename__ = 'flashcards'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False) #Corrected ON Delete
    front = Column(String(255), nullable=False)  # Corrected column names
    back = Column(String(255), nullable=False)   # Corrected column names
    additional_info = Column(Text, nullable=True)     # Corrected column names
    topic = Column(String(255), nullable=True)  # Added Topic Name
    created_at = Column(TIMESTAMP, server_default=func.now())

# Create the tables in the database (if they don't already exist)
Base.metadata.create_all(engine)
logger.info("Database tables created.")

# ---------------------------
# Anthropic API Client Wrapper
# ---------------------------
import anthropic

class AnthropicClientWrapper:
    """
    Wraps the Anthropic client for generating flashcards.
    """
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)
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
CORS(app) # Enables React to communicate with these Flask endpoints

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"message": "API is running!"}), 200

################# Login and registering endpoints
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()  # Get data sent from the frontend about new user's email and password
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'message': 'Both email and password are required for new account'}), 400

    # Hash the password before storing it for security reasons
    hashed_password = generate_password_hash(password)

    try:
        # Check if the email already exists
        if session.query(User).filter_by(email=email).first():
            return jsonify({'message': 'Email is already registered'}), 409

        new_user = User(email=email, password_hash=hashed_password)
        session.add(new_user)
        session.commit()
        session.close()
        return jsonify({'message': 'User created successfully'}), 201  # 201 Created status code
    except Exception as e:
        session.rollback()
        return jsonify({'message': f'Database error: {str(e)}'}), 500  # 500 internal server error

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


################# flashcard generator view endpoints
@app.route('/generate_flashcards', methods=['POST'])
def generate_flashcards():
    """
    Generate flashcards using Anthropic API.
    Expects JSON:
    {
      "quantity": 10,
      "topic": "cooking",
      "skill_level": "beginner",
      "speaker_profile": "Enjoys home cooking"
    }
    Returns:
    {
      "flashcards": [
        {"front": "Halló", "back": "Hello", "additional_info": "Common greeting"},
        ...
      ]
    }
    """
    data = request.get_json()
    quantity = data.get("quantity", 10)  # Default to 10 if not provided
    flashcard_topic = data.get("topic")
    skill_level = data.get("skill_level", "any")  # Default to "any" if not provided
    speaker_profile = data.get("speaker_profile", "")  # Default to "" if not provided

    # Validate required fields
    if not flashcard_topic:
        return jsonify({"error": "Missing required parameter: flashcard_topic"}), 400

    # Initialize Anthropic client and flashcard generator
    anthropic_client = AnthropicClientWrapper(api_key=API_KEY)
    prompt_templates = {
        "v1": (
            "You are tasked with generating {quantity} Icelandic-English word pairs related to {flashcard_topic} "
            "for a {skill_level} Icelandic speaker. Here is some information about the Icelandic speaker: \n"
            "<speaker_profile>\n{speaker_profile}\n</speaker_profile>.\n\n"
            "The generated word pairs should be personalised and relevant to the speaker's profile. This task is designed "
            "to help language learners expand their vocabulary in a specific category they request.\n\n"
            "Guidelines for generating the word pairs:\n"
            "- Choose words that a {skill_level} would find useful to learn \n"
            "- Relate the generated words to {flashcard_topic}\n"
            "- Ensure the words are appropriate for {skill_level}-level learners\n"
            "- Choose words that a speaker with the user profile {speaker_profile} would find most useful to learn for their life \n\n"
            "Generate {quantity} diverse and {skill_level}-level Icelandic-English word pairs related to {flashcard_topic}, "
            "keeping in mind the specified category. \n\n"
            "Before finalizing your output, double-check the accuracy of the Icelandic words and their English translations. \n\n"
            "Present your final list of {quantity} Icelandic-English word-pairs in the JSON format specified in the system prompt"
        )
    }
    system_prompt_templates = {
        "v2": (
            "You are a part of an AI powered app/website that generates English to Icelandic flashcards. Your specific job is "
            "to generate English and Icelandic word pairs in a consistent JSON format. You will receive user input including "
            "their skill level, preferred content, and other information.\n\n"
            "Output Format: You must return a JSON object with a key called \"word_pairs\". The value of \"word_pairs\" is a JSON array "
            "of objects, where each object has exactly these keys:\n"
            "- \"icelandic\": The Icelandic word, including principal parts in brackets for verbs\n"
            "- \"english\": The English word or phrase\n"
            "- \"additional_information\": Part of speech and gender for nouns, e.g., \"noun (m)\" for masculine nouns\n\n"
            "Grammar Rules: 1. For verbs: Include principal parts in brackets after the infinitive in this order: (ég present, ég past, "
            "við past, supine) 2. For nouns: Use the nominative singular form 3. For adjectives: Use the masculine nominative singular form\n\n"
            "You must output only valid JSON with no additional text or explanations. Double-check that your output follows the exact format."
        )
    }
    flashcard_generator = FlashcardGenerator(
        anthropic_client=anthropic_client,
        prompt_templates=prompt_templates,
        system_prompt_templates=system_prompt_templates,
        prompt_template_version="v1",
        system_prompt_template_version="v2",
        claude_temperature=0
    )

    # Generate flashcards from Anthropic API
    result = flashcard_generator.generate_flashcards(
        quantity=quantity,
        flashcard_topic=flashcard_topic,
        skill_level=skill_level,
        speaker_profile=speaker_profile
    )

    if not result or "word_pairs" not in result:
        return jsonify({"error": "Flashcard generation failed or returned no data"}), 500

    # Prepare the flashcards for the response, removing library_id and user_id
    flashcards = []
    for pair in result["word_pairs"]:
        flashcards.append({
            "front": pair.get("english", ""),
            "back": pair.get("icelandic", ""),
            "additional_info": pair.get("additional_information", "")
        })

    return jsonify({"flashcards": flashcards}), 200

@app.route('/save_flashcards', methods=['POST'])
def save_flashcards():
    """
    Save flashcards to the database.
    Expects JSON:
    {
      "user_id": 1,
      "flashcards": [
        {"front": "Halló", "back": "Hello", "additional_info": "Common greeting"},
        ...
      ],
      "topic": "Greetings"
    }
    """
    logger.info("Received request to /save_flashcards")  # Add this line
    data = request.get_json()
    user_id = data.get("user_id")
    flashcards = data.get("flashcards")
    topic = data.get("topic")

    if not all([user_id, flashcards, topic]):
        return jsonify({"error": "Missing required parameters"}), 400
    # Add this to show in terminal logs
    logger.info(user_id, flashcards, topic)

    try:
        user = session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        saved_ids = []
        for fc in flashcards:
            new_flashcard = Flashcard(
                user_id=user_id,
                front=fc.get("front", ""),
                back=fc.get("back", ""),
                additional_info=fc.get("additional_info", ""),
                topic=topic #Include the topic
            )

            session.add(new_flashcard)
            session.commit()
            saved_ids.append(new_flashcard.id)

        return jsonify({"message": f"{len(saved_ids)} flashcards saved", "flashcard_ids": saved_ids}), 200
    except Exception as e:
        logger.error(f"Error saving flashcards: {e}")
        session.rollback()
        return jsonify({"error": f"Failed to save flashcards: {str(e)}"}), 500
    finally:
       session.close()

################# View and edit flashcard library endpoints
# Endpoint to get a list of flashcards based on user and sorts
@app.route('/users/<int:user_id>/flashcards', methods=['GET'])
def get_user_flashcards(user_id):
    """
    Retrieve all flashcards for a given user with optional filtering and sorting.
    """
    topic = request.args.get('topic')
    sort_by = request.args.get('sort_by')

    try:
        user = session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        query = session.query(Flashcard).filter_by(user_id=user_id)

        if topic:
            query = query.filter(Flashcard.topic == topic)

        if sort_by:
            if sort_by == 'front':
                query = query.order_by(Flashcard.front)
            elif sort_by == 'back':
                query = query.order_by(Flashcard.back)
            elif sort_by == 'additional_info':
                query = query.order_by(Flashcard.additional_info)
            else:
                return jsonify({"error": "Invalid sort_by parameter"}), 400

        flashcards = query.all()

        results = [{
            "id": fc.id,
            "front": fc.front,
            "back": fc.back,
            "additional_info": fc.additional_info,
            "topic": fc.topic
        } for fc in flashcards]

        return jsonify({"flashcards": results}), 200

    except Exception as e:
        logger.error(f"Error retrieving flashcards: {e}")
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
    topic = data.get("topic")

    try:
        flashcard = session.query(Flashcard).get(flashcard_id)
        if not flashcard:
            return jsonify({"error": "Flashcard not found"}), 404

        if front:
            flashcard.front = front
        if back:
            flashcard.back = back
        if additional_info:
            flashcard.additional_info = additional_info
        if topic:
            flashcard.topic = topic

        session.commit()

        return jsonify({"message": "Flashcard updated successfully."}), 200

    except Exception as e:
        logger.error(f"Error updating flashcard: {e}")
        session.rollback()
        return jsonify({"error": f"Failed to update flashcard: {str(e)}"}), 500

################# Flashcard practice API endpoint
@app.route('/users/<int:user_id>/practice', methods=['GET'])
def get_practice_flashcards(user_id):
    """
    Retrieve a random sample of flashcards for a specific user, optionally filtered by topic.
    """
    num_flashcards = request.args.get('num_flashcards', 10, type=int)  # Default to 10
    topic = request.args.get('topic')

    try:
        user = session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        query = session.query(Flashcard).filter_by(user_id=user_id)

        if topic:
            query = query.filter(Flashcard.topic == topic)

        # Get a random sample of flashcards
        flashcards = query.order_by(func.random()).limit(num_flashcards).all()

        results = [{
            "id": fc.id,
            "front": fc.front,
            "back": fc.back,
            "additional_info": fc.additional_info,
            "topic": fc.topic
        } for fc in flashcards]

        return jsonify({"flashcards": results}), 200

    except Exception as e:
        logger.error(f"Error retrieving flashcards: {e}")
        return jsonify({"error": f"Failed to retrieve flashcards: {str(e)}"}), 500

# ---------------------------
# Main Entry Point
# ---------------------------
if __name__ == '__main__':
    # Run the Flask API server (set debug=False in production)
    app.run(debug=True)