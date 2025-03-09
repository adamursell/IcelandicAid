import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import HomeButton from './HomeButton';
import LogoutButton from './LogoutButton';
import Select from 'react-select';

const FlashcardLibrary = ({ userId, onLogout }) => {
  const [flashcards, setFlashcards] = useState([]);
  const [topics, setTopics] = useState([]);
  const [frontTexts, setFrontTexts] = useState([]);
  const [backTexts, setBackTexts] = useState([]);
  const [additionalInfos, setAdditionalInfos] = useState([]);
  
  // Filter states
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedFront, setSelectedFront] = useState(null);
  const [selectedBack, setSelectedBack] = useState(null);
  const [selectedInfo, setSelectedInfo] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editedCard, setEditedCard] = useState({});

  useEffect(() => {
    const fetchFlashcards = async () => {
      try {
        const response = await axios.get(`http://127.0.0.1:5000/users/${userId}/flashcards`);
        // Sort the flashcards when they're first fetched
        const sortedFlashcards = [...(response.data.flashcards || [])].sort((a, b) => {
          // First, sort by topic
          const topicCompare = a.topic.localeCompare(b.topic);
          if (topicCompare !== 0) return topicCompare;
          
          // If topics are equal, sort by front text
          const frontCompare = a.front.localeCompare(b.front);
          if (frontCompare !== 0) return frontCompare;
          
          // If front texts are equal, sort by back text
          const backCompare = a.back.localeCompare(b.back);
          if (backCompare !== 0) return backCompare;
          
          // Finally, sort by additional info
          return (a.additional_info || '').localeCompare(b.additional_info || '');
        });
        
        setFlashcards(sortedFlashcards);
        setError('');
        
        // Extract unique values and sort them alphabetically
        const uniqueTopics = [...new Set(response.data.flashcards.map(card => card.topic))]
          .sort((a, b) => a.localeCompare(b));
        const uniqueFronts = [...new Set(response.data.flashcards.map(card => card.front))]
          .sort((a, b) => a.localeCompare(b));
        const uniqueBacks = [...new Set(response.data.flashcards.map(card => card.back))]
          .sort((a, b) => a.localeCompare(b));
        const uniqueInfos = [...new Set(response.data.flashcards.map(card => card.additional_info))]
          .sort((a, b) => a.localeCompare(b));

        // Create sorted options for react-select
        setTopics(uniqueTopics.map(topic => ({ value: topic, label: topic })));
        setFrontTexts(uniqueFronts.map(front => ({ value: front, label: front })));
        setBackTexts(uniqueBacks.map(back => ({ value: back, label: back })));
        setAdditionalInfos(uniqueInfos.map(info => ({ value: info, label: info })));
      } catch (err) {
        console.error('Failed to fetch flashcards:', err);
        setError('Failed to load flashcards');
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) {
      fetchFlashcards();
    }
  }, [userId]);

  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/flashcards/${id}`);
      setFlashcards(flashcards.filter(fc => fc.id !== id));
    } catch (err) {
      console.error('Failed to delete flashcard:', err);
    }
  };

  const handleEdit = (flashcard) => {
    setEditingId(flashcard.id);
    setEditedCard({ ...flashcard });
  };

  const handleSave = async (id) => {
    try {
      await axios.put(`http://127.0.0.1:5000/flashcards/${id}`, editedCard);
      setFlashcards(flashcards.map(card => 
        card.id === id ? editedCard : card
      ));
      setEditingId(null);
      setEditedCard({});
    } catch (err) {
      console.error('Failed to update flashcard:', err);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditedCard({});
  };

  const handleChange = (field, value) => {
    setEditedCard(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const customStyles = {
    control: (provided) => ({
      ...provided,
      minHeight: '38px',
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
      padding: '8px 12px'
    }),
    menu: (provided) => ({
      ...provided,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      borderRadius: '4px',
      marginTop: '4px'
    })
  };

  // Filter flashcards based on selected values
  const filteredFlashcards = flashcards.filter(card => {
    const matchesTopic = !selectedTopic || card.topic === selectedTopic.value;
    const matchesFront = !selectedFront || card.front === selectedFront.value;
    const matchesBack = !selectedBack || card.back === selectedBack.value;
    const matchesInfo = !selectedInfo || card.additional_info === selectedInfo.value;
    return matchesTopic && matchesFront && matchesBack && matchesInfo;
  });

  if (isLoading) {
    return <div>Loading flashcards...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="flashcard-library">
      <HomeButton />
      <LogoutButton onLogout={onLogout} />
      <h2>Flashcard Library</h2>

      <div className="filters-container">
        <div className="filter-group">
          <label>Topic:</label>
          <Select
            value={selectedTopic}
            onChange={setSelectedTopic}
            options={topics}
            styles={customStyles}
            isClearable
            placeholder="Filter by topic..."
          />
        </div>
        <div className="filter-group">
          <label>Front Text:</label>
          <Select
            value={selectedFront}
            onChange={setSelectedFront}
            options={frontTexts}
            styles={customStyles}
            isClearable
            placeholder="Filter by front text..."
          />
        </div>
        <div className="filter-group">
          <label>Back Text:</label>
          <Select
            value={selectedBack}
            onChange={setSelectedBack}
            options={backTexts}
            styles={customStyles}
            isClearable
            placeholder="Filter by back text..."
          />
        </div>
        <div className="filter-group">
          <label>Additional Info:</label>
          <Select
            value={selectedInfo}
            onChange={setSelectedInfo}
            options={additionalInfos}
            styles={customStyles}
            isClearable
            placeholder="Filter by additional info..."
          />
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Topic</th>
            <th>Front</th>
            <th>Back</th>
            <th>Additional Info</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredFlashcards.map((flashcard) => (
            <tr key={flashcard.id}>
              <td>{flashcard.topic}</td>
              <td>
                {editingId === flashcard.id ? (
                  <input
                    type="text"
                    value={editedCard.front}
                    onChange={(e) => handleChange('front', e.target.value)}
                    className="edit-input"
                  />
                ) : (
                  flashcard.front
                )}
              </td>
              <td>
                {editingId === flashcard.id ? (
                  <input
                    type="text"
                    value={editedCard.back}
                    onChange={(e) => handleChange('back', e.target.value)}
                    className="edit-input"
                  />
                ) : (
                  flashcard.back
                )}
              </td>
              <td>
                {editingId === flashcard.id ? (
                  <input
                    type="text"
                    value={editedCard.additional_info}
                    onChange={(e) => handleChange('additional_info', e.target.value)}
                    className="edit-input"
                  />
                ) : (
                  flashcard.additional_info
                )}
              </td>
              <td className="action-buttons">
                {editingId === flashcard.id ? (
                  <>
                    <button 
                      onClick={() => handleSave(flashcard.id)}
                      className="save-btn"
                      title="Save"
                    >
                      <i className="fas fa-check"></i>
                    </button>
                    <button 
                      onClick={handleCancel}
                      className="cancel-btn"
                      title="Cancel"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => handleEdit(flashcard)}
                      className="edit-btn"
                      title="Edit"
                    >
                      <i className="fas fa-pencil-alt"></i>
                    </button>
                    <button 
                      onClick={() => handleDelete(flashcard.id)}
                      className="delete-btn"
                      title="Delete"
                    >
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FlashcardLibrary; 