from sqlalchemy import create_engine, Column, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from models import Base

# Load your database configuration
from main import app, check_and_update_schema

def update_schema():
    with app.app_context():
        # This should use your existing function to update the schema
        check_and_update_schema()
        print("Schema updated successfully")

if __name__ == "__main__":
    update_schema() 