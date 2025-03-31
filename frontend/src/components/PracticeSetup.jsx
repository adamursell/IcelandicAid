import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import HomeButton from './HomeButton';
import config from '../config';
import './PracticeSetup.css';
import axios from 'axios';

const PracticeSetup = () => {
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState({ value: 'all', label: 'All Topics' });
  const [quantity, setQuantity] = useState(10);
  const [maxAvailable, setMaxAvailable] = useState(0);
  const [practiceMode, setPracticeMode] = useState('spaced'); // Default to spaced repetition
  const [spacedAvailable, setSpacedAvailable] = useState(0);
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');

  console.log("PracticeSetup component loaded with userId:", userId);

  useEffect(() => {
    // Fetch available topics when component mounts
    const fetchTopics = async () => {
      if (!userId) {
        console.error("No userId available for fetching topics");
        return;
      }

      try {
        console.log(`Fetching topics from ${config.API_URL}/users/${userId}/topics`);
        const response = await fetch(`${config.API_URL}/users/${userId}/topics`);
        if (!response.ok) {
          throw new Error(`Failed to fetch topics: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log("Fetched topics:", data);
        
        // Sort topics alphabetically and create options array
        const sortedTopics = data.topics.sort((a, b) => a.localeCompare(b));
        const topicOptions = [
          { value: 'all', label: 'All Topics' },
          ...sortedTopics.map(topic => ({
            value: topic,
            label: topic
          }))
        ];
        setTopics(topicOptions);
      } catch (error) {
        console.error('Error fetching topics:', error);
      }
    };

    fetchTopics();
  }, [userId]);

  // Update max available cards when topic changes
  useEffect(() => {
    const fetchAvailableCards = async () => {
      if (!userId) {
        console.error("No userId available for fetching available cards");
        return;
      }
      
      try {
        // Fetch regular practice cards
        const regularEndpoint = `${config.API_URL}/users/${userId}/practice?topic=${selectedTopic.value}&num_flashcards=1`;
        console.log("Fetching regular practice cards from:", regularEndpoint);
        
        const regularResponse = await fetch(regularEndpoint);
        
        if (!regularResponse.ok) {
          throw new Error(`Failed to fetch regular practice cards: ${regularResponse.status} ${regularResponse.statusText}`);
        }
        
        const regularData = await regularResponse.json();
        console.log("Regular practice available cards:", regularData);
        setMaxAvailable(regularData.total_available);
        
        // Fetch spaced repetition cards
        const spacedEndpoint = `${config.API_URL}/users/${userId}/spaced-practice?topic=${selectedTopic.value}`;
        console.log("Fetching spaced repetition cards from:", spacedEndpoint);
        
        const spacedResponse = await fetch(spacedEndpoint);
        
        if (!spacedResponse.ok) {
          throw new Error(`Failed to fetch spaced repetition cards: ${spacedResponse.status} ${spacedResponse.statusText}`);
        }
        
        const spacedData = await spacedResponse.json();
        console.log("Spaced repetition available cards:", spacedData);
        
        if (spacedData.total_available !== undefined) {
          console.log(`Found ${spacedData.total_available} cards due for spaced repetition practice`);
          
          // If there are cards available, log the first one for debugging
          if (spacedData.flashcards && spacedData.flashcards.length > 0) {
            const sampleCard = spacedData.flashcards[0];
            console.log("Sample spaced repetition card:", {
              id: sampleCard.id,
              front: sampleCard.front,
              topic: sampleCard.topic,
              next_repetition_space: sampleCard.next_repetition_space
            });
          }
          
          setSpacedAvailable(spacedData.total_available);
        } else {
          console.error("Invalid response format for spaced repetition cards", spacedData);
          setSpacedAvailable(0);
        }
        
        // Adjust quantity if it exceeds available cards
        if (practiceMode === 'simple' && quantity > regularData.total_available) {
          setQuantity(Math.max(1, regularData.total_available));
        }
      } catch (error) {
        console.error('Error fetching available cards:', error);
        console.error('Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        });
        
        // Set defaults in case of error
        setMaxAvailable(0);
        setSpacedAvailable(0);
      }
    };

    fetchAvailableCards();
  }, [selectedTopic, userId, practiceMode, quantity]);

  const handleStartPractice = () => {
    try {
      console.log("Starting practice with:", {
        topic: selectedTopic.value,
        mode: practiceMode,
        quantity: quantity
      });
      
      // Debug available cards
      console.log("Available cards:", { 
        maxAvailable, 
        spacedAvailable, 
        practiceMode
      });
      
      // Add browser info for debugging
      console.log("Browser info:", { 
        url: window.location.href,
        userAgent: navigator.userAgent,
        localStorage: !!localStorage.getItem('userId')
      });
      
      // Log API URL
      console.log("API URL from config:", config.API_URL);
      
      // Construct navigation URL - Fix the URL to match component routing
      const navigationUrl = `/practice/session?topic=${encodeURIComponent(selectedTopic.value)}&mode=${practiceMode}&quantity=${quantity}`;
      console.log("Navigating to:", navigationUrl);
      
      // Create state object
      const navigationState = {
        topic: selectedTopic.value,
        quantity: quantity,
        practiceMode: practiceMode
      };
      
      // Perform navigation
      console.log("About to navigate with state:", navigationState);
      navigate('/practice/session', { state: navigationState });
      
      // Log after navigation attempt
      console.log("Navigation completed - if you see this, navigation was attempted");
      
      // Debug the new URL after navigation (should execute if navigate doesn't cause immediate redirect)
      setTimeout(() => {
        console.log("Current URL after navigation:", window.location.href);
      }, 100);
    } catch (error) {
      console.error("Error during navigation:", error);
    }
  };

  const customStyles = {
    control: (provided) => ({
      ...provided,
      minHeight: '44px',
      padding: '2px',
      borderColor: '#ddd',
      boxShadow: 'none',
      '&:hover': {
        borderColor: '#5DADE2'
      }
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected ? '#5DADE2' : state.isFocused ? '#E8F6FE' : 'white',
      color: state.isSelected ? 'white' : '#333',
      padding: '10px 15px'
    }),
    menu: (provided) => ({
      ...provided,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      borderRadius: '4px',
      marginTop: '4px'
    }),
    placeholder: (provided) => ({
      ...provided,
      color: '#666'
    })
  };

  return (
    <div className="practice-setup-container">
      <HomeButton />
      <h1>Practice Flashcards</h1>
      
      <div className="practice-mode-selection">
        <h2>Practice Mode</h2>
        <div className="practice-mode-options">
          <div 
            className={`practice-mode-option ${practiceMode === 'spaced' ? 'selected' : ''}`}
            onClick={() => setPracticeMode('spaced')}
          >
            <h3>Spaced Repetition</h3>
            <p>Practice flashcards that are due for review using the spaced repetition system.</p>
            <div className="card-count">
              <strong>{spacedAvailable}</strong> cards due for practice
            </div>
          </div>
          
          <div 
            className={`practice-mode-option ${practiceMode === 'simple' ? 'selected' : ''}`}
            onClick={() => setPracticeMode('simple')}
          >
            <h3>Simple Practice</h3>
            <p>Practice a set number of random flashcards from your library.</p>
            <div className="card-count">
              <strong>{maxAvailable}</strong> cards available
            </div>
          </div>
        </div>
      </div>
      
      <div className="practice-options">
        <h2>Choose Topic</h2>
        <Select
          className="topic-selector"
          value={selectedTopic}
          onChange={setSelectedTopic}
          options={topics}
          isSearchable
          placeholder="Select a topic..."
        />
        
        {practiceMode === 'simple' && (
          <div className="quantity-selector">
            <h2>Number of Cards</h2>
            <div className="quantity-input">
              <input
                type="range"
                min={1}
                max={Math.max(maxAvailable, 1)}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
              />
              <span>{quantity} cards</span>
            </div>
          </div>
        )}
        
        {practiceMode === 'spaced' && spacedAvailable === 0 && (
          <div className="info-message">
            <p>You don't have any flashcards due for practice with spaced repetition right now.</p>
            <p>Create more flashcards or come back later when cards are due for review.</p>
          </div>
        )}
      </div>
      
      <div className="practice-summary">
        <h2>Practice Summary</h2>
        <div className="summary-details">
          <div className="summary-item">
            <span className="label">Mode:</span>
            <span className="value">{practiceMode === 'spaced' ? 'Spaced Repetition' : 'Simple Practice'}</span>
          </div>
          <div className="summary-item">
            <span className="label">Topic:</span>
            <span className="value">{selectedTopic.label}</span>
          </div>
          {practiceMode === 'simple' && (
            <div className="summary-item">
              <span className="label">Cards:</span>
              <span className="value">{quantity}</span>
            </div>
          )}
          {practiceMode === 'spaced' && (
            <div className="summary-item">
              <span className="label">Cards Due:</span>
              <span className="value">{spacedAvailable}</span>
            </div>
          )}
        </div>
      </div>
      
      <button 
        className="start-practice-btn"
        onClick={handleStartPractice}
        disabled={(practiceMode === 'spaced' && spacedAvailable === 0) || (practiceMode === 'simple' && maxAvailable === 0)}
      >
        Start Practice
      </button>
    </div>
  );
};

export default PracticeSetup;