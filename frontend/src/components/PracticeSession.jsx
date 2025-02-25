import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocation, useHistory } from 'react-router-dom';
import HomeButton from './HomeButton';

const PracticeSession = ({ userId }) => {
  const [flashcards, setFlashcards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const location = useLocation();
  const history = useHistory();

  useEffect(() => {
    const fetchFlashcards = async () => {
      const params = new URLSearchParams(location.search);
      const numFlashcards = params.get('num') || 10;
      try {
        const response = await axios.get(`http://127.0.0.1:5000/users/${userId}/practice?num_flashcards=${numFlashcards}`);
        setFlashcards(response.data.flashcards);
      } catch (err) {
        console.error('Failed to fetch practice flashcards:', err);
      }
    };
    fetchFlashcards();
  }, [userId, location.search]);

  const handleNext = () => {
    setShowAnswer(false);
    setUserAnswer('');
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      history.push('/practice');
    }
  };

  const handlePracticeAgain = () => {
    setShowAnswer(false);
    setUserAnswer('');
    setFlashcards([...flashcards, flashcards[currentIndex]]);
    setCurrentIndex(currentIndex + 1);
  };

  if (flashcards.length === 0) return <div>Loading...</div>;

  const currentFlashcard = flashcards[currentIndex];

  return (
    <div>
      <HomeButton />
      <h2>Practice Session</h2>
      <div>
        <p>Front: {currentFlashcard.front}</p>
        <input
          type="text"
          placeholder="Your Answer"
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
        />
        <button onClick={() => setShowAnswer(true)}>Check Answer</button>
      </div>
      {showAnswer && (
        <div>
          <p>Correct Back: {currentFlashcard.back}</p>
          <p>Additional Info: {currentFlashcard.additional_info}</p>
          <button onClick={handlePracticeAgain}>Practice Again</button>
          <button onClick={handleNext}>Flashcard Complete</button>
        </div>
      )}
    </div>
  );
};

export default PracticeSession; 