import React from 'react';
import { useHistory } from 'react-router-dom';

const HomeButton = () => {
  const history = useHistory();

  return (
    <button
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        padding: '10px',
        backgroundColor: 'transparent',
        color: '#5DADE2',
        border: 'none',
        cursor: 'pointer',
        fontSize: '24px',
      }}
      onClick={() => history.push('/home')}
    >
      <i className="fas fa-home"></i>
    </button>
  );
};

export default HomeButton; 