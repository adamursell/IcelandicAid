from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, TIMESTAMP, DateTime, Float, Boolean
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB

Base = declarative_base()


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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    flashcard_libraries = relationship('FlashcardLibrary', back_populates='user')
    generations = relationship('FlashcardGeneration', back_populates='user')
    analytics = relationship('Analytics', back_populates='user')
    conversations = relationship('Conversation', back_populates='user')
    practice_streaks = relationship('PracticeStreak', back_populates='user')


class FlashcardLibrary(Base):
    __tablename__ = 'flashcard_libraries'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    library_name = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    next_repetition_space = Column(Integer, default=1, nullable=False)  # Default 1 day in days
    next_practice_time = Column(DateTime, server_default=func.now(), nullable=False)  # Default to creation time

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
    created_at = Column(DateTime, server_default=func.now())

    user = relationship('User', back_populates='generations')


class Analytics(Base):
    __tablename__ = 'analytics'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    event_type = Column(String(50), nullable=False)
    event_data = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship('User', back_populates='analytics')


class Conversation(Base):
    __tablename__ = 'conversations'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    scenario = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
    overall_score = Column(Float, nullable=True)
    overall_feedback = Column(Text, nullable=True)
    main_strengths = Column(Text, nullable=True)
    areas_to_improve = Column(Text, nullable=True)
    
    # Relationships
    user = relationship('User', back_populates='conversations')
    messages = relationship('ConversationMessage', back_populates='conversation', cascade='all, delete-orphan')


class ConversationMessage(Base):
    __tablename__ = 'conversation_messages'
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False)
    role = Column(String(50), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    feedback = Column(Text, nullable=True)  # JSON string containing feedback
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationship
    conversation = relationship('Conversation', back_populates='messages')


class ConversationFeedback(Base):
    __tablename__ = 'conversation_feedbacks'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    conversation_id = Column(Integer, ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False)
    feedback_summary = Column(Text, nullable=True)
    main_strengths = Column(Text, nullable=True)  # JSON string containing list of strengths
    areas_to_improve = Column(Text, nullable=True)  # JSON string containing list of areas to improve
    overall_score = Column(Float, nullable=True)
    grammar_score = Column(Float, nullable=True)  # Score from 0-10 for grammatical accuracy
    vocabulary_score = Column(Float, nullable=True)  # Score from 0-10 for vocabulary quality
    challenging_words = Column(Text, nullable=True)  # Store challenging words as JSON string
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    user = relationship('User', backref='conversation_feedbacks')
    conversation = relationship('Conversation', backref='feedback')


class PracticeStreak(Base):
    __tablename__ = 'practice_streaks'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    practice_type = Column(String(50), nullable=False)  # 'flashcard' or 'conversation'
    current_streak = Column(Integer, default=0, nullable=False)
    longest_streak = Column(Integer, default=0, nullable=False)
    last_practice_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship('User', back_populates='practice_streaks')


class PracticeSession(Base):
    __tablename__ = 'practice_sessions'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    practice_type = Column(String(50), nullable=False)  # 'flashcard' or 'conversation'
    session_data = Column(Text, nullable=True)  # JSON data about the session
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)

    user = relationship('User', foreign_keys=[user_id])


class Feedback(Base):
    __tablename__ = 'feedback'
    id = Column(Integer, primary_key=True)
    user_id = Column(String(255), nullable=True)  # Can be 'anonymous'
    feedback_type = Column(String(255), nullable=False)
    feedback_text = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    