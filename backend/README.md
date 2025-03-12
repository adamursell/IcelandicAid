# Icelandic Learning Aid Backend

This is the backend for the Icelandic Learning Aid application. It's a Flask-based API that provides flashcard generation, conversation practice, and learning analytics for Icelandic language learners.

## Local Development

1. Create a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Create a `.env` file with your environment variables (see `.env.sample` for reference)

4. Run the application:
   ```
   python main.py
   ```

## Deploying to Render

1. Create a new Web Service on Render
   - Connect your GitHub repository
   - Set the Root Directory to `backend`
   - Set the Build Command to `pip install -r requirements.txt`
   - Set the Start Command to `gunicorn main:app`

2. Set Environment Variables
   - Add your API keys and other configuration in the Environment section
   - If you need a database, create a PostgreSQL service on Render, which will automatically set the DATABASE_URL environment variable

3. Deploy
   - Click "Create Web Service"
   - Render will automatically build and deploy your application

## Environment Variables

See `.env.sample` for a list of required environment variables. 