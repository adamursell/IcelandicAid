import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import HomeButton from './HomeButton';
import PronunciationButton from './PronunciationButton';
import config from '../config';

const PracticeSession = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = localStorage.getItem('userId');
  const [flashcards, setFlashcards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [userGuess, setUserGuess] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [sessionParams, setSessionParams] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Add component-level debugging
  console.log("PracticeSession component file loaded");
  
  // Improved debugging in the component mounting effect
  useEffect(() => {
    console.log("PracticeSession component mounted");
    console.log("Current route:", window.location.pathname + window.location.search);
    console.log("userId from localStorage:", userId);
    
    // Log location and search params state
    console.log("Location state:", location.state);
    console.log("URL search params:", Object.fromEntries([...searchParams]));
    
    if (location.state) {
      console.log("Using location state for session parameters");
      setSessionParams(location.state);
    } else {
      console.log("Using URL parameters for session parameters");
      const topic = searchParams.get('topic') || 'all';
      const mode = searchParams.get('mode') || 'spaced';
      const quantity = parseInt(searchParams.get('quantity') || '10', 10);
      
      const params = {
        topic,
        practiceMode: mode,
        quantity
      };
      
      console.log("Extracted URL parameters:", params);
      setSessionParams(params);
    }
  }, [location.state, searchParams]);

  // Add detailed logging to the fetchFlashcards effect
  useEffect(() => {
    console.log("Session params or userId changed:", { 
      hasSessionParams: !!sessionParams, 
      sessionParams, 
      userId 
    });
    
    if (sessionParams && userId) {
      console.log("Calling fetchFlashcards()");
      fetchFlashcards();
    } else {
      console.log("Missing required data for fetching flashcards:", { 
        hasSessionParams: !!sessionParams, 
        hasUserId: !!userId 
      });
    }
  }, [sessionParams, userId]);

  const fetchFlashcards = async () => {
    if (!userId || !sessionParams) {
      console.error('Missing required data:', { userId, sessionParams });
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const { topic, quantity, practiceMode } = sessionParams;
      console.log('Starting practice session with:', { topic, quantity, practiceMode });
      
      // Add API URL debugging
      console.log('API URL from config:', config.API_URL);
      
      // Test if API is reachable
      try {
        const testResponse = await fetch(`${config.API_URL}/health`, { 
          method: 'GET',
          mode: 'cors'
        });
        console.log('API health check response:', { status: testResponse.status, ok: testResponse.ok });
      } catch (healthError) {
        console.error('API health check failed:', healthError);
      }
      
      // Start a new practice session
      console.log("Attempting to start practice session");
      const sessionUrl = `${config.API_URL}/users/${userId}/practice-sessions/start`;
      console.log("Session API URL:", sessionUrl);
      
      try {
        const sessionResponse = await fetch(sessionUrl, {
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
          console.log('Practice session started:', sessionData);
          setSessionId(sessionData.session_id);
        } else {
          console.error('Failed to start practice session:', await sessionResponse.text());
        }
      } catch (sessionError) {
        console.error('Error starting practice session:', sessionError);
        // Continue anyway - session ID is not critical
      }
      
      // Construct the API URL based on practice mode
      const apiUrl = practiceMode === 'spaced'
        ? `${config.API_URL}/users/${userId}/spaced-practice?topic=${topic}`
        : `${config.API_URL}/users/${userId}/practice?topic=${topic}&num_flashcards=${quantity}`;
      
      console.log('Fetching flashcards from:', apiUrl);
      
      try {
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to fetch flashcards:', errorText);
          setError(`Server error: ${response.status} ${response.statusText}`);
          setLoading(false);
          return;
        }
        
        const data = await response.json();
        console.log('Received flashcards:', data);
        
        if (!data.flashcards || data.flashcards.length === 0) {
          console.log('No flashcards available');
          setIsComplete(true);
        } else {
          console.log(`Loaded ${data.flashcards.length} flashcards`);
          setFlashcards(data.flashcards);
        }
      } catch (fetchError) {
        console.error('Error fetching flashcards:', fetchError);
        setError(`Network error: ${fetchError.message}`);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Unexpected error in fetchFlashcards:', error);
      setError(`General error: ${error.message}`);
      setLoading(false);
    }
  };

  const handleGuessSubmit = (e) => {
    e.preventDefault();
    setShowBack(true);
  };

  const handleKeepPracticing = async () => {
    // For simple practice mode
    if (sessionParams.practiceMode === 'simple') {
      try {
        const response = await fetch(`${config.API_URL}/users/${userId}/practice/next`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            current_card_id: flashcards[currentIndex].id,
            topic: sessionParams.topic
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
        
        const response = await fetch(`${config.API_URL}/users/${userId}/spaced-practice/next`, {
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
    if (sessionParams.practiceMode === 'simple') {
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
        
        const response = await fetch(`${config.API_URL}/users/${userId}/spaced-practice/next`, {
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
      const response = await fetch(`${config.API_URL}/users/${userId}/practice-sessions/${sessionId}/complete`, {
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

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setShowBack(false);
      setUserGuess('');
      inputRef.current?.focus();
    }
  };

  const handleFlip = () => {
    setShowBack(!showBack);
  };

  const handleNext = () => {
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowBack(false);
      setUserGuess('');
      inputRef.current?.focus();
    } else {
      setIsComplete(true);
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
          {sessionParams?.practiceMode === 'spaced' 
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
          {sessionParams?.practiceMode === 'spaced' 
            ? "You don't have any flashcards due for practice today." 
            : "No flashcards are available for practice."}
        </p>
        <button onClick={handleEndSession}>Return Home</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="practice-session">
        <HomeButton />
        <h2>Practice Session Error</h2>
        <div className="error-container" style={{ 
          border: '1px solid #f44336',
          borderRadius: '4px',
          padding: '20px',
          margin: '20px 0',
          backgroundColor: '#ffebee'
        }}>
          <h3>Something went wrong</h3>
          <p>{error}</p>
          <div style={{ marginTop: '20px' }}>
            <button onClick={() => navigate('/practice/setup')}>
              Return to Practice Setup
            </button>
          </div>
        </div>
        <div className="debug-info" style={{ 
          marginTop: '30px',
          padding: '10px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <h4>Debug Information</h4>
          <pre>{JSON.stringify({
            userId: userId ? 'exists' : 'missing',
            apiUrl: config.API_URL,
            sessionParams,
            currentUrl: window.location.href
          }, null, 2)}</pre>
        </div>
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
                
                <div style={{ 
                  margin: '10px 0', 
                  display: 'flex', 
                  justifyContent: 'center' 
                }}>
                  <PronunciationButton text={currentCard.back} />
                </div>
              </div>
              <div className="button-group">
                <button 
                  onClick={handleKeepPracticing}
                  className="keep-practicing-btn"
                >
                  {sessionParams?.practiceMode === 'spaced' ? "Incorrect" : "Keep Practicing"}
                </button>
                <button 
                  onClick={handleComplete}
                  className="complete-btn"
                >
                  {sessionParams?.practiceMode === 'spaced' ? "Correct" : "Complete"}
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