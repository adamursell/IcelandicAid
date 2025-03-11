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
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const fetchFlashcards = async () => {
      try {
        setLoading(true);
        const { topic, quantity, practiceMode } = location.state;
        
        // Start a new practice session
        const sessionResponse = await fetch(`http://localhost:5000/users/${userId}/practice-sessions/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            practice_type: practiceMode === 'spaced' ? 'flashcard' : 'flashcard',
            session_data: {
              topic,
              quantity,
              practice_mode: practiceMode
            }
          }),
        });
        
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          setSessionId(sessionData.session_id);
        }
        
        // Different endpoints for different practice modes
        const endpoint = practiceMode === 'spaced' 
          ? `http://localhost:5000/users/${userId}/spaced-practice?topic=${topic}`
          : `http://localhost:5000/users/${userId}/practice?topic=${topic}&num_flashcards=${quantity}`;
        
        const response = await fetch(endpoint);
        const data = await response.json();
        
        if (data.flashcards.length === 0) {
          setIsComplete(true);
        } else {
          setFlashcards(data.flashcards);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching flashcards:', error);
        setLoading(false);
      }
    };

    fetchFlashcards();
  }, [userId, location.state]);

  const handleGuessSubmit = (e) => {
    e.preventDefault();
    setShowBack(true);
  };

  const handleKeepPracticing = async () => {
    // For simple practice mode
    if (location.state.practiceMode === 'simple') {
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
    } 
    // For spaced repetition mode - mark as incorrect
    else {
      try {
        console.log(`Marking card ${flashcards[currentIndex].id} as incorrect`);
        
        const response = await fetch(`http://localhost:5000/users/${userId}/spaced-practice/next`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            current_card_id: flashcards[currentIndex].id,
            is_correct: false
          }),
        });
        
        console.log(`Response status: ${response.status}`);
        
        if (response.ok) {
          const nextCard = await response.json();
          console.log(`Received next card with ID: ${nextCard.id}`);
          
          // Move the current card to the end of the queue
          const currentCard = flashcards[currentIndex];
          
          // Create a new array without the current card
          const remainingFlashcards = flashcards.filter((_, index) => index !== currentIndex);
          
          // If the current card was marked incorrect, add it to the end
          remainingFlashcards.push(currentCard);
          
          // If we received a different card, add it to the queue (if it's not already there)
          if (nextCard.id !== currentCard.id && !remainingFlashcards.some(card => card.id === nextCard.id)) {
            remainingFlashcards.push(nextCard);
          }
          
          console.log(`Updated queue length: ${remainingFlashcards.length}`);
          setFlashcards(remainingFlashcards);
          
          // Move to the next card (which is now at the current index since we removed the current card)
          setCurrentIndex(currentIndex >= remainingFlashcards.length ? 0 : currentIndex);
        } else {
          const errorText = await response.text();
          console.error('Error in spaced repetition practice:', errorText);
          alert(`Error in spaced repetition practice: ${errorText}`);
        }
      } catch (error) {
        console.error('Error in spaced repetition practice:', error);
        alert(`Error in spaced repetition practice: ${error.message}`);
      }
      
      setShowBack(false);
      setUserGuess('');
      inputRef.current?.focus();
    }
  };

  const handleComplete = async () => {
    // For simple practice mode
    if (location.state.practiceMode === 'simple') {
      if (currentIndex === flashcards.length - 1) {
        setIsComplete(true);
      } else {
        setShowBack(false);
        setUserGuess('');
        setCurrentIndex(currentIndex + 1);
        inputRef.current?.focus();
      }
    } 
    // For spaced repetition mode - mark as correct
    else {
      try {
        console.log(`Marking card ${flashcards[currentIndex].id} as correct`);
        
        const response = await fetch(`http://localhost:5000/users/${userId}/spaced-practice/next`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            current_card_id: flashcards[currentIndex].id,
            is_correct: true
          }),
        });
        
        console.log(`Response status: ${response.status}`);
        
        if (response.status === 404) {
          // No more cards available
          console.log("No more cards available, completing session");
          setIsComplete(true);
          return;
        } 
        
        if (response.ok) {
          console.log("Successfully marked card as correct");
          
          // Remove the current card from the deck (it's completed for this session)
          const remainingFlashcards = flashcards.filter((_, index) => index !== currentIndex);
          console.log(`Remaining flashcards: ${remainingFlashcards.length}`);
          
          if (remainingFlashcards.length === 0) {
            // If that was the last card, we're done
            console.log("No more flashcards in the current session, completing");
            setIsComplete(true);
          } else {
            // Otherwise, continue with remaining cards
            const newIndex = currentIndex >= remainingFlashcards.length ? 0 : currentIndex;
            console.log(`Setting new index to ${newIndex}`);
            
            setFlashcards(remainingFlashcards);
            setCurrentIndex(newIndex);
            setShowBack(false);
            setUserGuess('');
            inputRef.current?.focus();
          }
        } else {
          const errorText = await response.text();
          console.error('Error updating flashcard:', errorText);
          alert(`Error updating flashcard: ${errorText}`);
        }
      } catch (error) {
        console.error('Error in spaced repetition practice:', error);
        alert(`Error in spaced repetition practice: ${error.message}`);
      }
    }
  };

  const handleEndSession = () => {
    // Complete the practice session if it's not already completed
    if (sessionId && !isComplete) {
      completePracticeSession();
    }
    navigate('/');
  };

  // Function to complete the practice session and update streak
  const completePracticeSession = async () => {
    if (!sessionId) return;
    
    try {
      const response = await fetch(`http://localhost:5000/users/${userId}/practice-sessions/${sessionId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Practice session completed. Current streak: ${data.current_streak}`);
      }
    } catch (error) {
      console.error('Error completing practice session:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading flashcards...</div>;
  }

  if (isComplete) {
    // Complete the practice session when all flashcards are done
    if (sessionId) {
      completePracticeSession();
      setSessionId(null); // Prevent multiple completions
    }
    
    return (
      <div className="practice-complete">
        <h2>Practice Session Complete!</h2>
        <p>
          {location.state.practiceMode === 'spaced' 
            ? "You've completed all your due flashcards for today." 
            : "You've completed this practice session."}
        </p>
        <button onClick={handleEndSession}>Return Home</button>
      </div>
    );
  }

  if (flashcards.length === 0) {
    return (
      <div className="practice-complete">
        <h2>No Flashcards Available</h2>
        <p>
          {location.state.practiceMode === 'spaced' 
            ? "You don't have any flashcards due for practice today." 
            : "No flashcards are available for practice."}
        </p>
        <button onClick={handleEndSession}>Return Home</button>
      </div>
    );
  }

  const currentCard = flashcards[currentIndex];

  return (
    <div className="practice-session">
      <HomeButton />
      <div className="practice-info">
        <div className="cards-info">
          <p>Cards remaining: {flashcards.length - currentIndex}</p>
        </div>
      </div>
      
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
                  {location.state.practiceMode === 'spaced' ? "Incorrect" : "Keep Practicing"}
                </button>
                <button 
                  onClick={handleComplete}
                  className="complete-btn"
                >
                  {location.state.practiceMode === 'spaced' ? "Correct" : "Complete"}
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