import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import HomeButton from './HomeButton';
import LogoutButton from './LogoutButton';

const FlashcardLibrary = ({ userId, onLogout }) => {
  const [flashcards, setFlashcards] = useState([]);
  const [filters, setFilters] = useState({ front: '', back: '', additional_info: '', topic: '' });
  const [suggestions, setSuggestions] = useState({ front: [], back: [], additional_info: [], topic: [] });
  const dropdownRefs = useRef({ front: null, back: null, additional_info: null, topic: null });

  useEffect(() => {
    const fetchFlashcards = async () => {
      try {
        const response = await axios.get(`http://127.0.0.1:5000/users/${userId}/flashcards`);
        setFlashcards(response.data.flashcards);
      } catch (err) {
        console.error('Failed to fetch flashcards:', err);
      }
    };
    fetchFlashcards();
  }, [userId]);

  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/flashcards/${id}`);
      setFlashcards(flashcards.filter(fc => fc.id !== id));
    } catch (err) {
      console.error('Failed to delete flashcard:', err);
    }
  };

  const handleEdit = (id, updatedFlashcard) => {
    setFlashcards(flashcards.map(fc => (fc.id === id ? updatedFlashcard : fc)));
  };

  const handleInputChange = (key, value) => {
    setFilters({ ...filters, [key]: value });

    const uniqueSuggestions = [...new Set(flashcards.map(fc => fc[key]))]
      .filter(item => item.toLowerCase().includes(value.toLowerCase()))
      .sort();

    setSuggestions({ ...suggestions, [key]: uniqueSuggestions });
  };

  const handleSelectSuggestion = (key, suggestion) => {
    setFilters({ ...filters, [key]: suggestion });
    setSuggestions({ ...suggestions, [key]: [] });
  };

  const handleClickOutside = (event) => {
    Object.keys(dropdownRefs.current).forEach(key => {
      if (dropdownRefs.current[key] && !dropdownRefs.current[key].contains(event.target)) {
        setSuggestions(prev => ({ ...prev, [key]: [] }));
      }
    });
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredFlashcards = flashcards.filter(fc =>
    Object.keys(filters).every(key => fc[key].toLowerCase().includes(filters[key].toLowerCase()))
  );

  return (
    <div>
      <HomeButton />
      <LogoutButton onLogout={onLogout} />
      <h2>Flashcard Library</h2>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {['front', 'back', 'additional_info', 'topic'].map(key => (
          <div key={key} style={{ position: 'relative', width: '200px' }} ref={el => dropdownRefs.current[key] = el}>
            <input
              type="text"
              placeholder={`Filter by ${key}`}
              value={filters[key]}
              onChange={(e) => handleInputChange(key, e.target.value)}
              style={{ width: '100%' }}
            />
            {suggestions[key].length > 0 && (
              <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #ccc', listStyleType: 'none', padding: '0', margin: '0', zIndex: 1 }}>
                {suggestions[key].map((suggestion, index) => (
                  <li key={index} onClick={() => handleSelectSuggestion(key, suggestion)} style={{ padding: '5px', cursor: 'pointer' }}>
                    {suggestion}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>Front</th>
            <th>Back</th>
            <th>Additional Info</th>
            <th>Topic</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredFlashcards.map(fc => (
            <tr key={fc.id}>
              <td>{fc.front}</td>
              <td>{fc.back}</td>
              <td>{fc.additional_info}</td>
              <td>{fc.topic}</td>
              <td>
                <button onClick={() => handleEdit(fc.id, fc)}>Edit</button>
                <button onClick={() => handleDelete(fc.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FlashcardLibrary; 