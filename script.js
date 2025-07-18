// ВАЖНО: Вставьте сюда ваш объект конфигурации Firebase из Шага 1
const firebaseConfig = {
  apiKey: "AIzaSyD5MW-S90SNq8yh6V0pc1lTWmEToDQtWOE",
  authDomain: "mufffllled.firebaseapp.com",
  projectId: "mufffllled",
  storageBucket: "mufffllled.firebasestorage.app",
  messagingSenderId: "513257850545",
  appId: "1:513257850545:web:d2344e0f2fdc7ae7c34490",
  measurementId: "G-46VW9YKB1R"
};

// Инициализация Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Глобальные переменные и ссылки на DOM ---
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const authError = document.getElementById('auth-error');

let currentUser = null;
let activeChatId = null;
let unsubscribeMessages = null; // Функция для отписки от слушателя сообщений

// --- ЛОГИКА АВТОРИЗАЦИИ ---
auth.onAuthStateChanged(async user => {
    if (user) {
        // Пользователь вошел
        const userDoc = await db.collection('users').doc(user.uid).get();
        currentUser = { uid: user.uid, ...userDoc.data() };

        document.getElementById('current-user-nickname').textContent = currentUser.nickname;
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');

        loadChats();
    } else {
        // Пользователь вышел
        currentUser = null;
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
        if (unsubscribeMessages) unsubscribeMessages();
        clearChatUI();
    }
});

// Регистрация
document.getElementById('signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const nickname = document.getElementById('signup-nickname').value.trim();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    authError.textContent = '';
    if (!nickname) {
        authError.textContent = 'Никнейм не может быть пустым.';
        return;
    }
    
    // Проверка на уникальность никнейма
    const nicknameQuery = await db.collection('users').where('nickname', '==', nickname).get();
    if (!nicknameQuery.empty) {
        authError.textContent = 'Этот никнейм уже занят.';
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCredential.user.uid).set({
            nickname: nickname,
            email: email
        });
    } catch (error) {
        authError.textContent = `Ошибка регистрации: ${error.message}`;
    }
});

// Вход
document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    authError.textContent = '';

    auth.signInWithEmailAndPassword(email, password).catch(error => {
        authError.textContent = `Ошибка входа: ${error.message}`;
    });
});

// Выход
document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
});

// --- ЛОГИКА ЧАТА ---

// Поиск пользователя
document.getElementById('search-form').addEventListener('submit', async e => {
    e.preventDefault();
    const searchNickname = document.getElementById('search-nickname').value.trim();
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';

    if (searchNickname === currentUser.nickname) {
        resultsContainer.innerHTML = '<p>Нельзя начать чат с самим собой.</p>';
        return;
    }

    const userQuery = await db.collection('users').where('nickname', '==', searchNickname).get();
    
    if (userQuery.empty) {
        resultsContainer.innerHTML = '<p>Пользователь не найден.</p>';
    } else {
        userQuery.forEach(doc => {
            const foundUser = { id: doc.id, ...doc.data() };
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';
            resultItem.classList.add('fade-in');
            resultItem.textContent = foundUser.nickname;
            resultItem.onclick = () => startChat(foundUser);
            resultsContainer.appendChild(resultItem);
        });
    }
});

// Начать чат
async function startChat(otherUser) {
    const members = [currentUser.uid, otherUser.id].sort();
    const chatId = members.join('_'); // Создаем уникальный ID чата

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
        // Создаем новый чат, если его нет
        const otherUserDoc = await db.collection('users').doc(otherUser.id).get();
        
        await chatRef.set({
            members: members,
            memberInfo: { // Сохраняем информацию для отображения
                [currentUser.uid]: { nickname: currentUser.nickname },
                [otherUser.id]: { nickname: otherUserDoc.data().nickname }
            },
            lastMessage: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    openChat(chatId);
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-nickname').value = '';
}

// Загрузка списка чатов пользователя
function loadChats() {
    db.collection('chats')
      .where('members', 'array-contains', currentUser.uid)
      .onSnapshot(snapshot => {
        const chatsList = document.getElementById('chats-list');
        chatsList.innerHTML = '';
        snapshot.forEach(doc => {
            const chat = { id: doc.id, ...doc.data() };
            const otherUserId = chat.members.find(id => id !== currentUser.uid);
            const otherUserInfo = chat.memberInfo[otherUserId];

            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            chatItem.classList.add('fade-in');

            if (chat.id === activeChatId) {
                chatItem.classList.add('active');
            }
            chatItem.dataset.chatId = chat.id;
            chatItem.innerHTML = `<strong>${otherUserInfo.nickname}</strong>`;
            chatItem.onclick = () => openChat(chat.id);
            chatsList.appendChild(chatItem);
        });
      });
}

// Открыть окно чата
function openChat(chatId) {
    if (activeChatId === chatId) return;
    
    if (unsubscribeMessages) {
        unsubscribeMessages(); // Отписываемся от предыдущего чата
    }

    activeChatId = chatId;
    
    // Подсвечиваем активный чат в списке
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.toggle('active', item.dataset.chatId === chatId);
    });

    const chatWindow = document.getElementById('chat-window');
    const placeholder = document.getElementById('chat-placeholder');
    const messagesContainer = document.getElementById('messages-container');
    
    messagesContainer.innerHTML = ''; // Очищаем старые сообщения
    chatWindow.classList.remove('hidden');
    placeholder.classList.add('hidden');

    // Получаем информацию о собеседнике и устанавливаем заголовок
    db.collection('chats').doc(chatId).get().then(doc => {
        const chatData = doc.data();
        const otherUserId = chatData.members.find(id => id !== currentUser.uid);
        const otherNickname = chatData.memberInfo[otherUserId].nickname;
        document.getElementById('chat-with-nickname').textContent = otherNickname;
    });

    // Подписываемся на новые сообщения
    unsubscribeMessages = db.collection('chats').doc(chatId).collection('messages')
      .orderBy('timestamp', 'asc')
      .onSnapshot(snapshot => {
          messagesContainer.innerHTML = '';
          snapshot.forEach(doc => {
              displayMessage(doc.data());
          });
          // Прокрутка вниз
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
      });
}

// Отображение одного сообщения
function displayMessage(message) {
    const messagesContainer = document.getElementById('messages-container');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add('fade-in');
  
    if (message.senderId === currentUser.uid) {
        messageElement.classList.add('sent');
    } else {
        messageElement.classList.add('received');
    }
    
    messageElement.textContent = message.text;
    messagesContainer.appendChild(messageElement);
}

// Отправка сообщения
document.getElementById('message-form').addEventListener('submit', e => {
    e.preventDefault();
    const messageInput = document.getElementById('message-input');
    const text = messageInput.value.trim();

    if (text && activeChatId) {
        const message = {
            senderId: currentUser.uid,
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        db.collection('chats').doc(activeChatId).collection('messages').add(message);
        
        // Обновляем поле последнего сообщения для сортировки чатов в будущем
        db.collection('chats').doc(activeChatId).update({
            lastMessage: text,
            lastMessageTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        messageInput.value = '';
    }
});

// Очистка UI чата
function clearChatUI() {
    activeChatId = null;
    document.getElementById('chats-list').innerHTML = '';
    document.getElementById('chat-window').classList.add('hidden');
    document.getElementById('chat-placeholder').classList.remove('hidden');
}
