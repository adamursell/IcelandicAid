import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import HomeButton from './HomeButton';
import config from '../config';

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
      try {
        // Fetch regular practice cards
        const regularResponse = await fetch(
          `${config.API_URL}/users/${userId}/practice?topic=${selectedTopic.value}&num_flashcards=1`
        );
        const regularData = await regularResponse.json();
        setMaxAvailable(regularData.total_available);
        
        // Fetch spaced repetition cards
        const spacedResponse = await fetch(
          `${config.API_URL}/users/${userId}/spaced-practice?topic=${selectedTopic.value}`
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
      
      // Construct navigation URL
      const navigationUrl = `/practice-session?topic=${encodeURIComponent(selectedTopic.value)}&mode=${practiceMode}&quantity=${quantity}`;
      console.log("Navigating to:", navigationUrl);
      
      // Create state object
      const navigationState = {
        topic: selectedTopic.value,
        quantity: quantity,
        practiceMode: practiceMode
      };
      
      // Perform navigation
      console.log("About to navigate with state:", navigationState);
      navigate(navigationUrl, { state: navigationState });
      
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
      <h2>Practice Setup</h2>
      
      <div className="practice-mode-selector">
        <div className={`mode-option ${practiceMode === 'spaced' ? 'active' : ''}`