import React from 'react';
import { useHistory } from 'react-router-dom';

const LogoutButton = ({ onLogout }) => {
  const history = useHistory();

  const handleLogout = () => {
    onLogout();
    history.push('/');
  };

  return (
    <button
      style={{
        position: 'absolute',
        top: '10px',
        right: '50px',
        padding: '10px',
        backgroundColor: 'transparent',
        color: '#5DADE2',
        border: 'none',
        cursor: 'pointer',
        fontSize: '24px',
      }}
      onClick={handleLogout}
    >
      <i className="fas fa-sign-out-alt"></i>
    </button>
  );
};

export default LogoutButton; 