import React from 'react';
import { useNavigate } from 'react-router-dom';
import HomeButton from './HomeButton';
import LogoutButton from './LogoutButton';
import { IconButton } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';

const Home = ({ userEmail, userId, onLogout }) => {
  const navigate = useNavigate();

  return (
    <div className="container" style={{ position: 'relative', padding: '20px' }}>
      {/* Header with account info and navigation */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px'
        }}>
          <span style={{ color: '#5DADE2', fontSize: '16px' }}>
            Welcome, {userEmail}
          </span>
          <IconButton 
            onClick={() => navigate('/account')}
            style={{
              color: '#5DADE2',
              padding: '8px'
            }}
          >
            <AccountCircleIcon />
          </IconButton>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <HomeButton />
          <LogoutButton onLogout={onLogout} />
        </div>
      </div>

      {/* Main menu content */}
      <div className="menu-container">
        <div className="kenni-logo-container">
          <h1 className="kenni-logo">Kenni</h1>
        </div>

        <button 
          className="menu-button conversation-button"
          onClick={() => navigate('/conversation')}
        >
          <span role="img" aria-label="conversation">💭</span>
          Conversational Practice
        </button>

        <div className="flashcard-section">
          <h2>Flashcards</h2>
          
          <button 
            className="menu-button"
            onClick={() => navigate('/practice')}
          >
            <span role="img" aria-label="pencil">✏️</span>
            Practice Mode
          </button>

          <div className="flashcard-options">
            <button 
              className="menu-button"
              onClick={() => navigate('/generate')}
            >
              <span role="img" aria-label="cards">🗂️</span>
              Generate Flashcards
            </button>
            
            <button 
              className="menu-button"
              onClick={() => navigate('/library')}
            >
              <span role="img" aria-label="library">📚</span>
              View Library
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home; 