import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import HomeButton from './HomeButton';

const PracticeSetup = () => {
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState({ value: 'all', label: 'All Topics' });
  const [quantity, setQuantity] = useState(10);
  const [maxAvailable, setMaxAvailable] = useState(0);
  const [practiceMode, setPracticeMode] = useState('spaced'); // Default to spaced repetition
  const [spacedAvailable, setSpacedAvailable] = useState(0);
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');

  useEffect(() => {
    // Fetch available topics when component mounts
    const fetchTopics = async () => {
      try {
        const response = await fetch(`http://localhost:5000/users/${userId}/topics`);
        const data = await response.json();
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
      try {
        // Fetch regular practice cards
        const regularResponse = await fetch(
          `http://localhost:5000/users/${userId}/practice?topic=${selectedTopic.value}&num_flashcards=1`
        );
        const regularData = await regularResponse.json();
        setMaxAvailable(regularData.total_available);
        
        // Fetch spaced repetition cards
        const spacedResponse = await fetch(
          `http://localhost:5000/users/${userId}/spaced-practice?topic=${selectedTopic.value}`
        );
        const spacedData = await spacedResponse.json();
        setSpacedAvailable(spacedData.total_available);
        
        // Adjust quantity if it exceeds available cards
        if (practiceMode === 'simple' && quantity > regularData.total_available) {
          setQuantity(regularData.total_available);
        }
      } catch (error) {
        console.error('Error fetching available cards:', error);
      }
    };

    fetchAvailableCards();
  }, [selectedTopic, userId, practiceMode]);

  const handleStartPractice = () => {
    navigate('/practice-session', {
      state: {
        topic: selectedTopic.value,
        quantity: quantity,
        practiceMode: practiceMode
      }
    });
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
      <h2>Practice Setup</h2>
      
      <div className="practice-mode-selector">
        <div className={`mode-option ${practiceMode === 'spaced' ? 'active' : ''}`} 
             onClick={() => setPracticeMode('spaced')}>
          Spaced repetition practice
        </div>
        <div className={`mode-option ${practiceMode === 'simple' ? 'active' : ''}`}
             onClick={() => setPracticeMode('simple')}>
          Simple practice
        </div>
      </div>
      
      <div className="setup-form">
        {practiceMode === 'simple' ? (
          <>
            <div className="form-group">
              <label htmlFor="topic">Select Topic:</label>
              <Select
                id="topic"
                value={selectedTopic}
                onChange={setSelectedTopic}
                options={topics}
                styles={customStyles}
                isSearchable={true}
                placeholder="Search for a topic..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="quantity">Number of Flashcards:</label>
              <input
                type="number"
                id="quantity"
                min="1"
                max={maxAvailable}
                value={quantity}
                onChange={(e) => setQuantity(Math.min(parseInt(e.target.value), maxAvailable))}
              />
              <span className="available-cards">
                (Maximum available: {maxAvailable})
              </span>
            </div>
          </>
        ) : (
          <div className="spaced-info">
            <p>Flashcards to practice today: {spacedAvailable}</p>
          </div>
        )}

        <button 
          onClick={handleStartPractice}
          disabled={(practiceMode === 'simple' && maxAvailable === 0) || 
                   (practiceMode === 'spaced' && spacedAvailable === 0)}
          className="begin-practice-btn"
        >
          Begin practice
        </button>
      </div>
    </div>
  );
};

export default PracticeSetup; 