from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, TIMESTAMP
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func

Base = declarative_base()


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    flashcard_libraries = relationship('FlashcardLibrary', back_populates='user')
    generations = relationship('FlashcardGeneration', back_populates='user')
    analytics = relationship('Analytics', back_populates='user')


class FlashcardLibrary(Base):
    __tablename__ = 'flashcard_libraries'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    library_name = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship('User', back_populates='flashcard_libraries')
    flashcards = relationship('Flashcard', back_populates='library')


class Flashcard(Base):
    __tablename__ = 'flashcards'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    library_id = Column(Integer, ForeignKey('flashcard_libraries.id', ondelete='CASCADE'), nullable=False)
    front_text = Column(String(255), nullable=False)  # English text
    back_text = Column(String(255), nullable=False)  # Icelandic text
    additional_info = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    library = relationship('FlashcardLibrary', back_populates='flashcards')


class FlashcardGeneration(Base):
    __tablename__ = 'flashcard_generations'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    prompt_template_version = Column(String(50), nullable=False)
    flashcard_topic = Column(String(255), nullable=False)
    skill_level = Column(String(50), nullable=False)
    speaker_profile = Column(Text, nullable=False)
    raw_output = Column(Text, nullable=True)  # Store the JSON response
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship('User', back_populates='generations')


class Analytics(Base):
    __tablename__ = 'analytics'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    event_type = Column(String(50), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship('User', back_populates='analytics')
