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
  // New state to track when a card has been moved to the end of the deck
  const [cardMovedToEnd, setCardMovedToEnd] = useState(null);
  // New state to track initial card count for progress bar
  const [initialCardCount, setInitialCardCount] = useState(0);
  // New state to track unique card IDs we've seen
  const [seenCardIds, setSeenCardIds] = useState(new Set());

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
          
          // Detailed logging about the cards' next practice times
          console.log("Received cards due for practice:", response.data.flashcards.map(card => ({
            id: card.id,
            next_practice_time: card.next_practice_time,
            next_repetition_space: card.next_repetition_space,
            days_until_due: card.days_until_due,
            is_due: card.is_due
          })));
          
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
              next_practice_time: card.next_practice_time,
              // Store raw data for debugging
              _raw: { ...card }
            };
          });
          
          console.log("Final formatted cards:", formattedCards);
          setFlashcards(formattedCards);
          setSessionId(response.data.session_id);
          setTotalCards(formattedCards.length);
          
          // Set the initial card count for progress tracking
          // Only set it if it's currently 0 (first load)
          if (initialCardCount === 0) {
            setInitialCardCount(formattedCards.length);
            
            // Initialize seenCardIds with all card IDs
            const cardIdsSet = new Set(formattedCards.map(card => card.id));
            setSeenCardIds(cardIdsSet);
          }
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
          
          // Set the initial card count for progress tracking
          // Only set it if it's currently 0 (first load)
          if (initialCardCount === 0) {
            setInitialCardCount(formattedCards.length);
            
            // Initialize seenCardIds with all card IDs
            const cardIdsSet = new Set(formattedCards.map(card => card.id));
            setSeenCardIds(cardIdsSet);
          }
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

  const moveToNextCard = () => {
    // Reset the flip state
    setIsFlipped(false);
    
    console.log(`Moving to next card, current index: ${currentIndex}, total cards: ${flashcards.length}`);
    
    // Move to the next card
    if (currentIndex + 1 < flashcards.length) {
      setCurrentIndex(currentIndex + 1);
      console.log(`Advanced to next card, new index: ${currentIndex + 1}`);
    } else {
      // All cards reviewed
      console.log('All cards reviewed, completing session');
      handleSessionCompletion();
    }
  };

  // Add a function to handle receiving a new card from the server after spaced repetition update
  const updateFlashcardsAfterResponse = (responseData, currentCardId, wasCorrect) => {
    console.log('Updating flashcards after response:', { 
      responseData, 
      currentCardId, 
      wasCorrect,
      responseDataType: typeof responseData,
      hasNextRepetitionSpace: responseData && responseData.next_repetition_space !== undefined,
      hasUpdatedCard: responseData && responseData.updated_card !== undefined
    });
    
    // Process updated card information if provided by the backend
    if (responseData.updated_card) {
      const updatedCardInfo = responseData.updated_card;
      console.log('Backend provided updated card information:', updatedCardInfo);
      
      if (wasCorrect) {
        console.log(`Card ${updatedCardInfo.id} update confirmation from server:`);
        console.log(`  - Next practice in ${updatedCardInfo.next_repetition_space} days`);
        console.log(`  - Next practice time: ${updatedCardInfo.next_practice_time}`);
      } else {
        console.log(`Card ${updatedCardInfo.id} was marked incorrect - server confirmed update:`);
        console.log(`  - Repetition space reduced to ${updatedCardInfo.next_repetition_space} days`);
        console.log(`  - Next practice time: ${updatedCardInfo.next_practice_time}`);
      }
    }
    
    // Check if we've completed all cards
    if (responseData.cards_completed && wasCorrect) {
      console.log('All cards completed for today');
      handleSessionCompletion();
      return;
    }
    
    if (wasCorrect) {
      // If the backend provided updated card info, use that
      if (responseData.updated_card) {
        console.log(`Card ${currentCardId} was successfully updated in the database.`);
        console.log(`It will next appear for practice in ${responseData.updated_card.next_repetition_space} days`);
        console.log(`Next practice time: ${responseData.updated_card.next_practice_time}`);
      } else {
        // Fallback to using the repetition space from the response if available
        console.log(`Card ${currentCardId} was marked correct - it will next appear for practice in ${responseData.next_repetition_space || 'unknown'} days`);
      }
      
      // If the card was marked as correct, remove it from the current session's cards
      // as it's been scheduled for future practice
      const updatedCards = flashcards.filter(card => card.id !== currentCardId);
      console.log(`Removed card ${currentCardId} from session, cards remaining: ${updatedCards.length}`);
      
      // Update total cards if the backend provides this information
      if (responseData.cards_remaining !== undefined) {
        console.log(`Backend reports ${responseData.cards_remaining} cards remaining`);
        setTotalCards(responseData.cards_remaining);
      }
      
      // Track that this card has been correctly answered
      setSeenCardIds(prevSeenCardIds => {
        const updatedSeenCardIds = new Set(prevSeenCardIds);
        updatedSeenCardIds.delete(currentCardId); // Remove from set to mark as completed
        return updatedSeenCardIds;
      });
      
      // If this was the last card in our local array
      if (updatedCards.length === 0) {
        // If backend indicates there are still cards, fetch them (this might happen if there's a sync issue)
        if (responseData.cards_remaining > 0) {
          console.log('Local cards empty but backend says more cards exist, refreshing...');
          fetchFlashcards();
          return;
        } else {
          console.log('No cards remaining after update, completing session');
          handleSessionCompletion();
          return;
        }
      }
      
      setFlashcards(updatedCards);
      
      // Adjust the current index if necessary
      if (currentIndex >= updatedCards.length) {
        console.log(`Current index ${currentIndex} would be out of bounds, resetting to ${updatedCards.length - 1}`);
        setCurrentIndex(Math.max(0, updatedCards.length - 1));
      } else {
        // Keep the same index since we're removing the current card
        // No need to change the current index
      }
    } else {
      // For incorrect answers in spaced repetition mode
      if (sessionParams.practiceMode === 'spaced') {
        console.log(`Card ${currentCardId} was marked incorrect - moving to back of deck for re-practice`);
        
        // Update the card's information if provided by the backend
        if (responseData.updated_card) {
          console.log(`Card ${currentCardId} was successfully updated in the database.`);
          console.log(`Repetition space reduced to ${responseData.updated_card.next_repetition_space} days`);
          console.log(`Next practice time reset to: ${responseData.updated_card.next_practice_time}`);
        }
        
        // Move the current card to the end of the deck
        const currentCard = flashcards.find(card => card.id === currentCardId);
        if (currentCard) {
          // Create a new array with the current card moved to the end
          const updatedCards = [
            ...flashcards.filter(card => card.id !== currentCardId),
            currentCard
          ];
          
          console.log('Updated flashcard deck (current card moved to end):', updatedCards);
          
          // Update the flashcards state
          setFlashcards(updatedCards);
          
          // Use the cardMovedToEnd state to trigger the useEffect
          // that will handle updating the index after the flashcards state has been updated
          setCardMovedToEnd(currentCardId);
          
          // Reset the flip state
          setIsFlipped(false);
          return;
        }
      }
      
      // Legacy code for non-spaced repetition mode or if card not found
      if (responseData.id) {
        // Check if the returned card is already in our deck
        const cardExists = flashcards.some(card => card.id === responseData.id);
        
        if (!cardExists) {
          // Format the new card
          const newCard = {
            id: responseData.id,
            front: responseData.front,
            back: responseData.back,
            additional_info: responseData.additional_info || '',
            next_repetition_space: responseData.next_repetition_space,
          };
          
          console.log('Adding new card from API response:', newCard);
          
          // Create a new array with the current card moved to the end and the new card added
          const updatedCards = [
            ...flashcards.filter(card => card.id !== currentCardId),
            ...flashcards.filter(card => card.id === currentCardId),
            newCard
          ];
          
          console.log('Updated flashcard deck:', updatedCards);
          setFlashcards(updatedCards);
          
          // Just move to the next card
          if (currentIndex >= flashcards.length - 1) {
            setCurrentIndex(0);
          } else {
            setCurrentIndex(currentIndex + 1);
          }
          setIsFlipped(false);
        } else {
          console.log('Card returned by API is already in our deck, continuing...');
          
          // Just rearrange the cards to put the current card at the end
          if (currentCardId) {
            const updatedCards = [
              ...flashcards.filter(card => card.id !== currentCardId),
              ...flashcards.filter(card => card.id === currentCardId)
            ];
            
            console.log('Updated flashcard deck (rearranged):', updatedCards);
            setFlashcards(updatedCards);
            
            // Adjust the current index
            if (currentIndex >= updatedCards.length - 1) {
              setCurrentIndex(0);
            } else {
              setCurrentIndex(currentIndex + 1);
            }
            setIsFlipped(false);
          }
        }
      } else {
        // If no card ID in response but we're still processing an incorrect answer
        // Just move to the next card without ending the session
        if (currentIndex >= flashcards.length - 1) {
          setCurrentIndex(0);
        } else {
          setCurrentIndex(currentIndex + 1);
        }
        setIsFlipped(false);
      }
    }
  };
  
  const markAsKnown = async () => {
    if (currentIndex >= flashcards.length) return;
    
    try {
      // Get the current card before updating the score
      const currentCard = flashcards[currentIndex];
      
      // Log detailed info about what we're doing
      console.log(`Marking card ${currentCard.id} as known/correct`);
      console.log(`Card details:`, {
        id: currentCard.id,
        front: currentCard.front,
        back: currentCard.back,
        next_repetition_space: currentCard.next_repetition_space
      });
      
      // Update the score
      setScore({ ...score, correct: score.correct + 1 });
      
      // For spaced repetition mode, update the card's spacing
      if (sessionParams.practiceMode === 'spaced') {
        const requestData = {
          current_card_id: currentCard.id,
          is_correct: true
        };
        console.log(`Sending spaced repetition update:`, requestData);
        
        // Call the API to update the spaced repetition status
        const response = await axios.post(
          `${config.API_URL}/users/${userId}/spaced-practice/next`, 
          requestData
        );
        
        console.log('Spaced repetition API response for correct card:', response.data);
        
        // Update the flashcards array based on the response
        updateFlashcardsAfterResponse(response.data, currentCard.id, true);
        return; // Skip the automatic moveToNextCard since we're handling it in updateFlashcardsAfterResponse
      }
      
      // Move to the next card (only for non-spaced repetition mode)
      moveToNextCard();
    } catch (error) {
      console.error('Error marking card as known:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Try to continue with next card anyway to prevent getting stuck
      moveToNextCard();
    }
  };

  const markAsUnknown = async () => {
    if (currentIndex >= flashcards.length) return;
    
    try {
      // Get the current card before updating the score
      const currentCard = flashcards[currentIndex];
      
      // Log detailed info about what we're doing
      console.log(`Marking card ${currentCard.id} as unknown/incorrect`);
      console.log(`Card details:`, {
        id: currentCard.id,
        front: currentCard.front,
        back: currentCard.back,
        next_repetition_space: currentCard.next_repetition_space
      });
      
      // Update the score
      setScore({ ...score, incorrect: score.incorrect + 1 });
      
      // For spaced repetition mode, update the card's spacing
      if (sessionParams.practiceMode === 'spaced') {
        const requestData = {
          current_card_id: currentCard.id,
          is_correct: false
        };
        console.log(`Sending spaced repetition update:`, requestData);
        
        // Call the API to update the spaced repetition status
        const response = await axios.post(
          `${config.API_URL}/users/${userId}/spaced-practice/next`, 
          requestData
        );
        
        console.log('Spaced repetition API response for incorrect card:', response.data);
        
        // Update the flashcards array based on the response
        updateFlashcardsAfterResponse(response.data, currentCard.id, false);
        return; // Skip the automatic moveToNextCard since we're handling it in updateFlashcardsAfterResponse
      }
      
      // Move to the next card (only for non-spaced repetition mode)
      moveToNextCard();
    } catch (error) {
      console.error('Error marking card as unknown:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Try to continue with next card anyway to prevent getting stuck
      moveToNextCard();
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

  // Add useEffect to handle index update after card is moved to end
  useEffect(() => {
    if (cardMovedToEnd !== null) {
      console.log(`Card ${cardMovedToEnd} was moved to the end of the deck, updating index...`);
      
      // When a card is moved to the end, we need to ensure the index points to the next unseen card
      // If we were at the last card, we need to go back to the beginning
      if (currentIndex >= flashcards.length - 1) {
        console.log('We were at the last card - setting index to 0 to continue practice from the beginning');
        setCurrentIndex(0);
      } else {
        // Otherwise, we keep the current index because:
        // - The card that was at index i is now moved to the end
        // - The card that was at index i+1 is now at index i
        // So by keeping the same index, we'll show the next card
        console.log(`Keeping index at ${currentIndex} to show the next unreviewed card`);
      }
      
      // Reset the moved card tracking
      setCardMovedToEnd(null);
      
      // Reset flip state to show front of card
      setIsFlipped(false);
    }
  }, [cardMovedToEnd, flashcards, currentIndex]);

  // Add useEffect to log progress information
  useEffect(() => {
    if (sessionParams?.practiceMode === 'spaced') {
      console.log('Progress tracking info:', {
        initialCardCount,
        seenCardIdsSize: seenCardIds.size,
        correctlyAnsweredCards: initialCardCount - seenCardIds.size,
        progressPercentage: ((initialCardCount - seenCardIds.size) / initialCardCount) * 100
      });
    }
  }, [seenCardIds, initialCardCount, sessionParams]);

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
              <span className="stat-label">Correct Guesses</span>
            </div>
            <div className="stat-item">
              <span className="stat-value incorrect">{score.incorrect}</span>
              <span className="stat-label">Incorrect Guesses</span>
            </div>
            <div className="stat-item">
              <span className="stat-value total">{score.correct + score.incorrect}</span>
              <span className="stat-label">Total Guesses</span>
            </div>
          </div>
          <p>
            {sessionParams?.practiceMode === 'spaced' 
              ? "Well done, all flashcards for this session completed for today!" 
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
          <p>{sessionParams?.practiceMode === 'spaced' 
            ? "Well done, all flashcards for this session completed for today!" 
            : "You've completed this practice session."}</p>
          <p>Correct Guesses: {score.correct} | Incorrect Guesses: {score.incorrect}</p>
          <button onClick={() => navigate('/home')} className="end-session-btn">
            Return to Flashcard Sets
          </button>
        </div>
      ) : (
        <div className="practice-content">
          <div className="card-count">
            {sessionParams?.practiceMode === 'spaced' 
              ? `${seenCardIds.size} of ${initialCardCount} cards remaining` 
              : `Card ${currentIndex + 1} of ${flashcards.length}`
            }
          </div>
          <div className="progress-bar-container">
            {sessionParams?.practiceMode === 'spaced' ? (
              <div 
                className="progress-bar" 
                style={{ width: `${((initialCardCount - seenCardIds.size) / initialCardCount) * 100}%` }}
              ></div>
            ) : (
              <div 
                className="progress-bar" 
                style={{ width: `${((currentIndex) / flashcards.length) * 100}%` }}
              ></div>
            )}
          </div>
          
          <div className="score-display">
            <div className="correct">Correct Guesses: {score.correct}</div>
            <div className="incorrect">Incorrect Guesses: {score.incorrect}</div>
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