# test_queries.py
from main import session, User, FlashcardLibrary, Flashcard

def test_queries():
    print("=== Users ===")
    users = session.query(User).all()
    for user in users:
        print(f"User ID: {user.id}, Email: {user.email}, Created At: {user.created_at}")

    print("\n=== Flashcard Libraries ===")
    libraries = session.query(FlashcardLibrary).all()
    for lib in libraries:
        print(f"Library ID: {lib.id}, Name: {lib.library_name}, User ID: {lib.user_id}")

    print("\n=== Flashcards ===")
    flashcards = session.query(Flashcard).all()
    for fc in flashcards:
        print(f"Flashcard ID: {fc.id}, Front: {fc.front_text}, Back: {fc.back_text}, Additional Info: {fc.additional_info}")

if __name__ == "__main__":
    test_queries()
