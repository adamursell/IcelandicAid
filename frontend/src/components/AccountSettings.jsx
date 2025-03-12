import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HomeButton from './HomeButton';
import LogoutButton from './LogoutButton';
import LearnerProgress from './LearnerProgress';
import config from '../config';

const AccountSettings = ({ userId, onLogout }) => {
  const navigate = useNavigate();
  const [userData, setUserData] = useState({
    email: '',
    password: '',
    profession: '',
    hobbies: '',
    interests: '',
    skill_level: '',
    additional_info: '',
    gender: 'neutral'
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('progress'); // Default to progress

  useEffect(() => {
    fetchUserData();
  }, [userId]);

  const fetchUserData = async () => {
    try {
      const response = await fetch(`${config.API_URL}/users/${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }
      const userData = await response.json();
      setUserData({ ...userData, password: '' });
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to load user data');
    }
  };

  const handleChange = (e) => {
    setUserData({
      ...userData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${config.API_URL}/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (response.ok) {
        setMessage('Account information updated successfully!');
        setError('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update account information');
      }
    } catch (error) {
      console.error('Error updating user data:', error);
      setError('Failed to update account information');
    }
  };

  const renderLoginDetails = () => {
    return (
      <div className="account-section">
        <h2>Login Details</h2>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={userData.email}
            disabled
          />
        </div>

        <div className="form-group">
          <label>New Password (leave blank to keep current)</label>
          <input
            type="password"
            name="password"
            value={userData.password}
            onChange={handleChange}
          />
        </div>
      </div>
    );
  };

  const renderLearnerPersonalisation = () => {
    return (
      <div className="account-section">
        <h2>Learner Personalisation</h2>
        <div className="form-group">
          <label>Profession</label>
          <input
            type="text"
            name="profession"
            value={userData.profession}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Hobbies</label>
          <input
            type="text"
            name="hobbies"
            value={userData.hobbies}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Interests</label>
          <input
            type="text"
            name="interests"
            value={userData.interests}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Skill Level</label>
          <select
            name="skill_level"
            value={userData.skill_level}
            onChange={handleChange}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div className="form-group">
          <label>Additional Information</label>
          <textarea
            name="additional_info"
            value={userData.additional_info}
            onChange={handleChange}
            rows="4"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="container" style={{ position: 'relative', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <HomeButton />
        <LogoutButton onLogout={onLogout} />
      </div>
      
      <h1 style={{ color: '#5DADE2', textAlign: 'center', marginBottom: '30px' }}>User Profile</h1>
      
      {message && <div className="message">{message}</div>}
      {error && <div className="error">{error}</div>}

      <div className="account-settings-container">
        {/* Left-side menu */}
        <div className="account-menu">
          <div 
            className={`account-menu-item ${activeSection === 'progress' ? 'active' : ''}`}
            onClick={() => setActiveSection('progress')}
          >
            Learner Progress
          </div>
          <div 
            className={`account-menu-item ${activeSection === 'login' ? 'active' : ''}`}
            onClick={() => setActiveSection('login')}
          >
            Login Details
          </div>
          <div 
            className={`account-menu-item ${activeSection === 'learner' ? 'active' : ''}`}
            onClick={() => setActiveSection('learner')}
          >
            Learner Personalisation
          </div>
        </div>

        {/* Right-side content */}
        <div className="account-content">
          {activeSection === 'progress' && (
            <LearnerProgress userId={userId} onLogout={onLogout} isEmbedded={true} />
          )}
          
          {activeSection !== 'progress' && (
            <form onSubmit={handleSubmit} className="form-group">
              {activeSection === 'login' ? renderLoginDetails() : renderLearnerPersonalisation()}
              
              <button type="submit" style={{ width: '100%', marginTop: '20px' }}>
                Save Changes
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountSettings; 