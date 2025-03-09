import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import HomeButton from './HomeButton';

const PracticeSession = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  const [flashcards, setFlashcards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [userGuess, setUserGuess] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const fetchFlashcards = async () => {
      try {
        const { topic, quantity } = location.state;
        const response = await fetch(
          `http://localhost:5000/users/${userId}/practice?topic=${topic}&num_flashcards=${quantity}`
        );
        const data = await response.json();
        setFlashcards(data.flashcards);
      } catch (error) {
        console.error('Error fetching flashcards:', error);
      }
    };

    fetchFlashcards();
  }, [userId, location.state]);

  const handleGuessSubmit = (e) => {
    e.preventDefault();
    setShowBack(true);
  };

  const handleKeepPracticing = async () => {
    try {
      const response = await fetch(`http://localhost:5000/users/${userId}/practice/next`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_card_id: flashcards[currentIndex].id,
          topic: location.state.topic
        }),
      });
      
      if (response.ok) {
        const nextCard = await response.json();
        setFlashcards([...flashcards, nextCard]);
      }
    } catch (error) {
      console.error('Error fetching next card:', error);
    }
    
    setShowBack(false);
    setUserGuess('');
    setCurrentIndex(currentIndex + 1);
    inputRef.current?.focus();
  };

  const handleComplete = () => {
    if (currentIndex === flashcards.length - 1) {
      setIsComplete(true);
    } else {
      setShowBack(false);
      setUserGuess('');
      setCurrentIndex(currentIndex + 1);
      inputRef.current?.focus();
    }
  };

  const handleEndSession = () => {
    navigate('/');
  };

  if (flashcards.length === 0) {
    return <div>Loading flashcards...</div>;
  }

  if (isComplete) {
    return (
      <div className="practice-complete">
        <h2>Practice Session Complete!</h2>
        <button onClick={handleEndSession}>Return Home</button>
      </div>
    );
  }

  const currentCard = flashcards[currentIndex];

  return (
    <div className="practice-session">
      <div className="flashcard">
        <div className="card-content">
          <h3>Front:</h3>
          <p>{currentCard.front}</p>
          
          <form onSubmit={handleGuessSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={userGuess}
              onChange={(e) => setUserGuess(e.target.value)}
              placeholder="Type your answer..."
              disabled={showBack}
              autoFocus
            />
            {!showBack && (
              <button type="submit">Show Answer</button>
            )}
          </form>

          {showBack && (
            <div className="answer-section">
              <div className="user-guess">
                <h4>Your Answer:</h4>
                <p>{userGuess}</p>
              </div>
              <div className="correct-answer">
                <h4>Correct Answer:</h4>
                <p>{currentCard.back}</p>
              </div>
              <div className="button-group">
                <button 
                  onClick={handleKeepPracticing}
                  className="keep-practicing-btn"
                >
                  Keep Practicing
                </button>
                <button 
                  onClick={handleComplete}
                  className="complete-btn"
                >
                  Complete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <button className="end-session" onClick={handleEndSession}>
        End Session
      </button>
    </div>
  );
};

export default PracticeSession; 