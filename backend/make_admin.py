from main import app, get_db
from models import User

def make_user_admin(email):
    with app.app_context():
        db = get_db()
        user = db.query(User).filter(User.email == email).first()
        
        if user:
            user.is_admin = True
            db.commit()
            print(f"User {email} is now an admin.")
        else:
            print(f"User {email} not found.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python make_admin.py user@email.com")
    else:
        email = sys.argv[1]
        make_user_admin(email) 