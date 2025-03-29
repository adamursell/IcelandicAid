import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import HomeButton from './HomeButton';
import PronunciationButton from './PronunciationButton';
import config from '../config';
import './PracticeSession.css'; // We'll create this file next
import axios from 'axios';

const PracticeSession = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = localStorage.getItem('userId');
  const [flashcards, setFlashcards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [sessionParams, setSessionParams] = useState(null);
  const [error, setError] = useState(null);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const cardRef = useRef(null);
  const [totalCards, setTotalCards] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
    setIsLoading(true);
    setHasError(false);
    
    try {
      let endpoint = '';
      let response = null;
      
      if (sessionParams.practiceMode === 'spaced') {
        // For spaced repetition mode
        endpoint = `${config.API_URL}/users/${userId}/spaced-practice`;
        if (sessionParams.topic !== 'all') {
          endpoint += `?topic=${encodeURIComponent(sessionParams.topic)}`;
        }
        console.log("Fetching spaced flashcards from:", endpoint);
        response = await axios.get(endpoint);
        
        console.log("API response for spaced flashcards:", response.data);
        
        // Process cards and add them to state
        if (response.data && response.data.flashcards && response.data.flashcards.length > 0) {
          // Log the raw API response for debugging
          console.log("Raw API response structure:", {
            hasFlashcards: !!response.data.flashcards,
            flashcardsLength: response.data.flashcards.length,
            firstCard: response.data.flashcards[0],
            allCardKeys: response.data.flashcards.map(card => Object.keys(card))
          });
          
          // Make sure each card has front and back properties
          const formattedCards = response.data.flashcards.map((card, index) => {
            // Log detailed card data
            console.log(`Card ${index + 1}:`, card);
            
            // Try to extract the values using the correct property names
            // The API is using 'front' and 'back' properties, not 'front_text' and 'back_text'
            const frontText = String(card.front || card.front_text || "");
            const backText = String(card.back || card.back_text || "");
            
            console.log(`Card ${index + 1} extracted:`, { frontText, backText });
            
            return {
              id: card.id,
              front: frontText,
              back: backText,
              additional_info: card.additional_info || '',
              next_repetition_space: card.next_repetition_space,
              // Store raw data for debugging
              _raw: { ...card }
            };
          });
          
          console.log("Final formatted cards:", formattedCards);
          setFlashcards(formattedCards);
          setSessionId(response.data.session_id);
          setTotalCards(formattedCards.length);
        } else {
          console.log("No flashcards in response or empty array:", {
            hasData: !!response.data,
            hasFlashcards: !!(response.data && response.data.flashcards),
            length: response.data?.flashcards?.length || 0
          });
          setFlashcards([]);
          setTotalCards(0);
        }
      } else {
        // For simple practice mode
        endpoint = `${config.API_URL}/users/${userId}/practice`;
        const params = new URLSearchParams();
        
        if (sessionParams.topic !== 'all') {
          params.append('topic', sessionParams.topic);
        }
        
        if (sessionParams.quantity && !isNaN(sessionParams.quantity)) {
          params.append('num_flashcards', sessionParams.quantity);
        }
        
        if (params.toString()) {
          endpoint += `?${params.toString()}`;
        }
        
        console.log("Fetching regular flashcards from:", endpoint);
        response = await axios.get(endpoint);
        console.log("API response for regular flashcards:", response.data);
        
        if (response.data && response.data.flashcards && response.data.flashcards.length > 0) {
          // Log the raw API response for debugging
          console.log("Raw API response structure:", {
            hasFlashcards: !!response.data.flashcards,
            flashcardsLength: response.data.flashcards.length,
            firstCard: response.data.flashcards[0],
            allCardKeys: response.data.flashcards.map(card => Object.keys(card))
          });
          
          // Make sure each card has front and back properties
          const formattedCards = response.data.flashcards.map((card, index) => {
            // Log detailed card data
            console.log(`Card ${index + 1}:`, card);
            
            // Try to extract the values using the correct property names
            // The API is using 'front' and 'back' properties, not 'front_text' and 'back_text'
            const frontText = String(card.front || card.front_text || "");
            const backText = String(card.back || card.back_text || "");
            
            console.log(`Card ${index + 1} extracted:`, { frontText, backText });
            
            return {
              id: card.id,
              front: frontText,
              back: backText,
              additional_info: card.additional_info || '',
              // Store raw data for debugging
              _raw: { ...card }
            };
          });
          
          console.log("Final formatted cards:", formattedCards);
          setFlashcards(formattedCards);
          setSessionId(response.data.session_id);
          setTotalCards(formattedCards.length);
        } else {
          console.log("No flashcards in response or empty array:", {
            hasData: !!response.data,
            hasFlashcards: !!(response.data && response.data.flashcards),
            length: response.data?.flashcards?.length || 0
          });
          setFlashcards([]);
          setTotalCards(0);
        }
      }
    } catch (error) {
      console.error('Error fetching flashcards:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setHasError(true);
      setErrorMessage(`Failed to load flashcards: ${error.message}`);
    } finally {
      console.log("Setting isLoading to false");
      setIsLoading(false);
    }
  };

  const handleCardFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const markAsKnown = async () => {
    if (currentIndex >= flashcards.length) return;
    
    try {
      // Update the score
      setScore({ ...score, correct: score.correct + 1 });
      
      const currentCard = flashcards[currentIndex];
      
      // For spaced repetition mode, update the card's spacing
      if (sessionParams.practiceMode === 'spaced') {
        // Call the API to update the spaced repetition status
        await axios.post(`${config.API_URL}/users/${userId}/spaced-practice/next`, {
          session_id: sessionId,
          flashcard_id: currentCard.id,
          known: true
        });
      }
      
      // Move to the next card
      moveToNextCard();
    } catch (error) {
      console.error('Error marking card as known:', error);
    }
  };

  const markAsUnknown = async () => {
    if (currentIndex >= flashcards.length) return;
    
    try {
      // Update the score
      setScore({ ...score, incorrect: score.incorrect + 1 });
      
      const currentCard = flashcards[currentIndex];
      
      // For spaced repetition mode, update the card's spacing
      if (sessionParams.practiceMode === 'spaced') {
        // Call the API to update the spaced repetition status
        await axios.post(`${config.API_URL}/users/${userId}/spaced-practice/next`, {
          session_id: sessionId,
          flashcard_id: currentCard.id,
          known: false
        });
      }
      
      // Move to the next card
      moveToNextCard();
    } catch (error) {
      console.error('Error marking card as unknown:', error);
    }
  };

  const moveToNextCard = () => {
    // Reset the flip state
    setIsFlipped(false);
    
    // Move to the next card
    if (currentIndex + 1 < flashcards.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // All cards have been reviewed
      handleSessionCompletion();
    }
  };

  const handleSessionCompletion = () => {
    setIsComplete(true);
    
    // Complete the practice session in the backend
    if (sessionId) {
      completePracticeSession();
    }
  };

  const completePracticeSession = async () => {
    try {
      await axios.post(`${config.API_URL}/users/${userId}/practice-sessions/${sessionId}/complete`, {
        correct: score.correct,
        incorrect: score.incorrect
      });
    } catch (error) {
      console.error('Error completing practice session:', error);
    }
  };

  const handleEndSession = () => {
    // Remove the confirmation dialog
    // Simply end the session or navigate home
    if (isComplete) {
      // If session is already complete, just navigate home
      navigate('/home');
    } else {
      // Otherwise mark the session as complete first
      handleSessionCompletion();
      // Then navigate home
      navigate('/home');
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsFlipped(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    } else {
      setIsComplete(true);
    }
  };

  // Render function to display the current flashcard
  const renderFlashcard = () => {
    if (!flashcards.length) return null;
    
    const currentCard = flashcards[currentIndex];
    
    if (!currentCard) {
      return <div className="empty-message">No content available.</div>;
    }

    return (
      <div 
        className={`practice-card ${isFlipped ? 'flipped' : ''}`} 
        onClick={handleCardFlip}
      >
        <div className="practice-card-inner">
          <div className="practice-card-front">
            <h3>{currentCard.front || 'No front content'}</h3>
            {currentCard.additional_info && (
              <div className="additional-info">{currentCard.additional_info}</div>
            )}
            <div className="tap-to-flip">Tap to flip</div>
          </div>
          <div className="practice-card-back">
            <h3>{currentCard.back || 'No back content'}</h3>
            <div className="pronunciation-wrapper">
              <PronunciationButton text={currentCard.back || ""} />
            </div>
            <div className="tap-to-flip">Tap to flip</div>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="practice-session-container">
        <HomeButton />
        <div className="loading">
          <div className="loader"></div>
          <p>Loading flashcards...</p>
        </div>
      </div>
    );
  }

  if (isComplete) {
    // Complete the practice session when all flashcards are done
    if (sessionId) {
      completePracticeSession();
      setSessionId(null); // Prevent multiple completions
    }
    
    return (
      <div className="practice-session-container">
        <HomeButton />
        <div className="practice-complete">
          <h2>Practice Session Complete!</h2>
          <div className="practice-stats">
            <div className="stat-item">
              <span className="stat-value correct">{score.correct}</span>
              <span className="stat-label">Correct</span>
            </div>
            <div className="stat-item">
              <span className="stat-value incorrect">{score.incorrect}</span>
              <span className="stat-label">Incorrect</span>
            </div>
            <div className="stat-item">
              <span className="stat-value total">{score.correct + score.incorrect}</span>
              <span className="stat-label">Total Cards</span>
            </div>
          </div>
          <p>
            {sessionParams?.practiceMode === 'spaced' 
              ? "You've completed all your due flashcards for today." 
              : "You've completed this practice session."}
          </p>
          <button onClick={() => navigate('/home')} className="action-button primary">Return Home</button>
        </div>
      </div>
    );
  }

  if (flashcards.length === 0) {
    return (
      <div className="practice-session-container">
        <HomeButton />
        <div className="practice-complete">
          <h2>No Flashcards Available</h2>
          <p>
            {sessionParams?.practiceMode === 'spaced' 
              ? "You don't have any flashcards due for practice today." 
              : "No flashcards are available for practice."}
          </p>
          <button onClick={handleEndSession} className="action-button primary">Return Home</button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="practice-session-container">
        <HomeButton />
        <h2>Practice Session Error</h2>
        <div className="error-container">
          <h3>Something went wrong</h3>
          <p>{error}</p>
          <div className="error-actions">
            <button onClick={() => navigate('/practice/setup')}>
              Return to Practice Setup
            </button>
          </div>
        </div>
        <div className="debug-info">
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

  return (
    <div className="practice-session-container">
      <HomeButton />
      <h2>Flashcards</h2>
      {isLoading ? (
        <div className="loading">
          <div className="loader"></div>
          <p>Loading flashcards...</p>
        </div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : flashcards.length === 0 ? (
        <div className="empty-message">No flashcards available for practice.</div>
      ) : isComplete ? (
        <div className="practice-complete">
          <h3>Practice Complete!</h3>
          <p>You've completed this practice session.</p>
          <p>Correct: {score.correct} | Incorrect: {score.incorrect}</p>
          <button onClick={() => navigate('/home')} className="end-session-btn">
            Return to Flashcard Sets
          </button>
        </div>
      ) : (
        <div className="practice-content">
          <div className="card-count">
            Card {currentIndex + 1} of {flashcards.length}
          </div>
          <div className="progress-bar-container">
            <div 
              className="progress-bar" 
              style={{ width: `${((currentIndex) / flashcards.length) * 100}%` }}
            ></div>
          </div>
          
          <div className="score-display">
            <div className="correct">Correct: {score.correct}</div>
            <div className="incorrect">Incorrect: {score.incorrect}</div>
          </div>
          
          {renderFlashcard()}
          
          <div className="button-container">
            <button 
              className="dont-know-btn" 
              onClick={() => markAsUnknown()}
            >
              ✗ Don't Know
            </button>
            <button 
              className="know-it-btn" 
              onClick={() => markAsKnown()}
            >
              ✓ Know It
            </button>
          </div>
          
          <button onClick={handleEndSession} className="end-session-btn">
            End Session
          </button>
        </div>
      )}
    </div>
  );
};

export default PracticeSession; 