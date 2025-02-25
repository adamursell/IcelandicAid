import React from 'react';
import { useHistory } from 'react-router-dom';
import HomeButton from './HomeButton';
import LogoutButton from './LogoutButton';

const Home = ({ userEmail, onLogout }) => {
  const history = useHistory();

  return (
    <div className="container" style={{ position: 'relative', padding: '20px' }}>
      <HomeButton />
      <LogoutButton onLogout={onLogout} />
      <div style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '16px', color: '#5DADE2' }}>
        Welcome, {userEmail}
      </div>
      <div style={{ textAlign: 'center', marginTop: '60px' }}>
        <h1 style={{ color: '#5DADE2' }}>Icelandic Learning Aid</h1>
        <h3>Select one of the options below to begin learning</h3>
        <div style={{ marginTop: '40px' }}>
          <button
            style={{ width: '640px', marginBottom: '20px', fontSize: '18px' }}
            onClick={() => history.push('/practice')}
          >
            <i className="fas fa-pencil-alt"></i> Practice Mode
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <button style={{ width: '300px', fontSize: '16px' }} onClick={() => history.push('/generate')}>
              <i className="fas fa-hammer"></i> Generate Flashcards
            </button>
            <button style={{ width: '300px', fontSize: '16px' }} onClick={() => history.push('/library')}>
              <i className="fas fa-book"></i> View Library
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home; 