import React, { useState, useEffect } from 'react';
import { Button, TextField, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import HomeButton from './HomeButton';
import LogoutButton from './LogoutButton';
import config from '../config';

const StyledDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    minWidth: '400px',
  },
}));

const StyledTextField = styled(TextField)({
  marginBottom: '1rem',
  '& .MuiInputBase-input': {
    color: '#fff',
  },
  '& .MuiInputLabel-root': {
    color: '#888',
  },
  '& .MuiOutlinedInput-root': {
    '& fieldset': {
      borderColor: '#444',
    },
    '&:hover fieldset': {
      borderColor: '#666',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#888',
    },
  },
});

const UserAccount = ({ open, onClose, userId }) => {
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

  useEffect(() => {
    if (open && userId) {
      fetchUserData();
    }
  }, [open, userId]);

  const fetchUserData = async () => {
    try {
      const response = await fetch(`${config.API_URL}/users/${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }
      const userData = await response.json();
      setUserData(userData);
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
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
        alert('User information updated successfully!');
        onClose();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error updating user data:', error);
      alert('Error updating user information');
    }
  };

  const handleChange = (e) => {
    setUserData({ ...userData, [e.target.name]: e.target.value });
  };

  return (
    <StyledDialog open={open} onClose={onClose}>
      <DialogTitle>Edit Account Information</DialogTitle>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <StyledTextField
            label="Email"
            name="email"
            value={userData.email}
            onChange={handleChange}
            fullWidth
            disabled
          />
          <StyledTextField
            label="New Password (leave blank to keep current)"
            name="password"
            type="password"
            value={userData.password}
            onChange={handleChange}
            fullWidth
          />
          <StyledTextField
            label="Profession"
            name="profession"
            value={userData.profession}
            onChange={handleChange}
            fullWidth
          />
          <StyledTextField
            label="Hobbies"
            name="hobbies"
            value={userData.hobbies}
            onChange={handleChange}
            fullWidth
          />
          <StyledTextField
            label="Interests"
            name="interests"
            value={userData.interests}
            onChange={handleChange}
            fullWidth
          />
          <StyledTextField
            select
            label="Skill Level"
            name="skill_level"
            value={userData.skill_level}
            onChange={handleChange}
            fullWidth
          >
            <MenuItem value="beginner">Beginner</MenuItem>
            <MenuItem value="intermediate">Intermediate</MenuItem>
            <MenuItem value="advanced">Advanced</MenuItem>
          </StyledTextField>
          <StyledTextField
            label="Additional Information"
            name="additional_info"
            value={userData.additional_info}
            onChange={handleChange}
            fullWidth
            multiline
            rows={4}
          />
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Cancel
        </Button>
        <Button onClick={handleSubmit} color="primary">
          Save Changes
        </Button>
      </DialogActions>
    </StyledDialog>
  );
};

export default UserAccount; 