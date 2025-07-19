// --- НАСТРОЙКА SUPABASE ---
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // Вставьте сюда ваш Project URL
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Вставьте сюда ваш anon key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Глобальные переменные и ссылки на DOM ---
let currentUser = null;
let activeChatId = null;
let messagesSubscription = null;

// Ссылки на все DOM-элементы
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const profileModalContainer = document.getElementById('profile-modal-container');
// ... и так далее для всех элементов, с которыми мы работаем

// --- ОСНОВНАЯ ЛОГИКА АУТЕНТИФИКАЦИИ ---

// Функция проверки текущего пользователя
const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error) {
            console.error('Ошибка получения профиля:', error);
            await supabase.auth.signOut(); // Выходим, если профиль не найден
        } else {
            currentUser = profile;
            setupUIForLoggedInUser();
            loadChats();
        }
    } else {
        setupUIForLoggedOutUser();
    }
};

// Отслеживание изменений состояния аутентификации
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        currentUser = null;
        setupUIForLoggedOutUser();
    } else if (session?.user && !currentUser) {
        checkUser();
    }
});

// Вызываем проверку при первой загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
});


// --- УПРАВЛЕНИЕ UI ---

function setupUIForLoggedInUser() {
    document.getElementById('current-user-nickname').textContent = currentUser.nickname;
    document.getElementById('my-profile-pic-sidebar').src = currentUser.profile_pic_url || 'placeholder.png';
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
}

function setupUIForLoggedOutUser() {
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    if (messagesSubscription) {
        supabase.removeChannel(messagesSubscription);
        messagesSubscription = null;
    }
    clearChatUI();
}

function clearChatUI() {
    activeChatId = null;
    document.getElementById('chats-list').innerHTML = '';
    document.getElementById('chat-window').classList.add('hidden');
    document.getElementById('chat-placeholder').classList.remove('hidden');
    appContainer.classList.remove('mobile-chat-view');
}

// --- ФОРМЫ ВХОДА И РЕГИСТРАЦИИ ---

// ... (код для переключения форм 'show-signup' и 'show-login' остается таким же)

// Регистрация
document.getElementById('signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const nickname = document.getElementById('signup-nickname').value.trim();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) return alert('Ошибка регистрации: ' + authError.message);
    if (!authData.user) return alert('Что-то пошло не так, пользователь не создан.');

    const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        nickname: nickname,
        bio: "Привет! Я использую Aura Chat.",
    });
    if (profileError) return alert('Ошибка создания профиля: ' + profileError.message);

    alert('Регистрация успешна! Пожалуйста, подтвердите ваш email, чтобы войти.');
});

// Вход
document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert('Ошибка входа: ' + error.message);
});

// Выход
document.getElementById('logout-btn').addEventListener('click', () => supabase.auth.signOut());


// --- ЛОГИКА ПРОФИЛЯ ---

// Открытие модального окна профиля
async function openProfileModal(userId) {
    const { data: userData, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) return alert('Не удалось загрузить профиль.');

    document.getElementById('profile-modal-pic').src = userData.profile_pic_url || 'placeholder.png';
    document.getElementById('profile-modal-nickname').textContent = userData.nickname;
    document.getElementById('profile-modal-bio').textContent = userData.bio;

    const isMyProfile = userId === currentUser.id;
    document.getElementById('edit-profile-btn').classList.toggle('hidden', !isMyProfile);
    document.getElementById('edit-profile-pic-btn').classList.toggle('hidden', !isMyprofile);
    // ... (остальной код для управления видимостью кнопок)

    profileModalContainer.classList.remove('hidden');
}
window.openProfileModal = openProfileModal; // Делаем функцию доступной в HTML

// ... (код для закрытия модального окна и перехода в режим редактирования)

// Сохранение профиля
document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const newBio = document.getElementById('profile-modal-bio-edit').value;
    const profilePicFile = document.getElementById('profile-pic-input').files[0];

    try {
        let newPicUrl = currentUser.profile_pic_url;
        if (profilePicFile) {
            const filePath = `${currentUser.id}/profile.png`;
            // Удаляем старое фото, чтобы не засорять хранилище
            await supabase.storage.from('profile_pics').remove([filePath]);
            const { error: uploadError } = await supabase.storage.from('profile_pics').upload(filePath, profilePicFile, { upsert: true });
            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('profile_pics').getPublicUrl(filePath);
            newPicUrl = data.publicUrl;
        }

        const { error: updateError } = await supabase.from('profiles').update({ bio: newBio, profile_pic_url: newPicUrl }).eq('id', currentUser.id);
        if (updateError) throw updateError;
        
        await checkUser(); // Перезагружаем данные пользователя
        profileModalContainer.classList.add('hidden');

    } catch (error) {
        console.error("Ошибка сохранения профиля:", error);
        alert("Не удалось сохранить профиль.");
    }
});


// --- ЛОГИКА ЧАТА ---

// ... (код для поиска пользователя и создания чата)

// Модифицированная функция открытия чата
async function openChat(chatId, otherUserInfo) {
    if (activeChatId === chatId) return;
    if (messagesSubscription) supabase.removeChannel(messagesSubscription);

    activeChatId = chatId;
    document.getElementById('chat-header-info').onclick = () => openProfileModal(otherUserInfo.id);
    document.getElementById('chat-with-pic').src = otherUserInfo.profile_pic_url || 'placeholder.png';
    document.getElementById('chat-with-nickname').textContent = otherUserInfo.nickname;

    // ... (код для подсветки активного чата и показа окна)
    appContainer.classList.add('mobile-chat-view');

    await loadMessageHistory(chatId);
    subscribeToMessages(chatId);
}

// Загрузка истории
async function loadMessageHistory(chatId) {
    const { data, error } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at');
    if (error) return console.error("Ошибка загрузки истории:", error);
    
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = '';
    data.forEach(displayMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Подписка на новые сообщения
function subscribeToMessages(chatId) {
    messagesSubscription = supabase.channel(`chat_${chatId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, payload => {
            displayMessage(payload.new);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }).subscribe();
}


// --- ОТПРАВКА СООБЩЕНИЙ И ФАЙЛОВ ---

// ... (код для `attach-file-btn` и `image-input` `change` event listener)

// Отправка картинки
async function sendImageMessage(file) {
    try {
        const filePath = `${activeChatId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('chat_images').upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('chat_images').getPublicUrl(filePath);
        await sendMessage(data.publicUrl, 'image');

    } catch (error) {
        console.error("Ошибка загрузки изображения:", error);
        alert("Не удалось отправить картинку.");
    }
}

// Универсальная функция отправки
async function sendMessage(content, type = 'text') {
    if (!content.trim() || !activeChatId) return;

    let messageData = { chat_id: activeChatId, sender_id: currentUser.id, type };
    if (type === 'text') messageData.text = content;
    else if (type === 'image') messageData.image_url = content;

    const { error } = await supabase.from('messages').insert(messageData);
    if (error) console.error('Ошибка отправки сообщения:', error);
    else document.getElementById('message-input').value = '';
}

// ... (остальной код для `message-form` submit и `displayMessage` без изменений)

function displayMessage(message) {
    const messagesContainer = document.getElementById('messages-container');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
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

