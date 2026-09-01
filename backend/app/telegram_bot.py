import asyncio
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from database import get_db_connection
import pymysql

BOT_TOKEN = "8872364345:AAGfTP4_tdYWG1SDj5_Z7fwHGBR4VfotptE"
ADMIN_CHAT_ID = "863968849"

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

class RegState(StatesGroup):
    session_token = State()
    institute = State()
    role = State()
    full_name = State()
    id_number = State()

def sync_db_query(query, params=None, fetchone=False, fetchall=False, commit=False):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute(query, params or ())
        if commit: conn.commit()
        if fetchone: return cursor.fetchone()
        if fetchall: return cursor.fetchall()
    finally:
        conn.close()

@dp.message(Command("start"))
async def start_handler(message: types.Message, state: FSMContext):
    args = message.text.split()
    session_token = args[1] if len(args) > 1 else None
    chat_id = str(message.from_user.id)

    user = sync_db_query("SELECT * FROM users WHERE chat_id = %s", (chat_id,), fetchone=True)

    if not user:
        if not session_token:
            await message.answer("Welcome to Medication Audit. You are not registered.")
            return

        await state.update_data(session_token=session_token)
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="PIP", callback_data="inst_PIP"), InlineKeyboardButton(text="PIPR", callback_data="inst_PIPR")],
            [InlineKeyboardButton(text="SOP", callback_data="inst_SOP"), InlineKeyboardButton(text="PIPER", callback_data="inst_PIPER")]
        ])
        await message.answer("Welcome! Let's get you registered. Select your Institute:", reply_markup=kb)
        await state.set_state(RegState.institute)
        return

    if not user['is_approved']:
        await message.answer("Your account is pending admin approval. Please wait.")
        return

    if not session_token:
        await message.answer(f"Welcome back, {user['full_name']}! Open the WebApp to scan a login QR code.")
        return

    if user['role'] in ['Faculty', 'Admin']:
        # Update DB!
        sync_db_query("UPDATE auth_sessions SET status='success', target_view='faculty_dashboard.html', chat_id=%s WHERE session_token=%s", (chat_id, session_token), commit=True)
        # Using pure ASCII text to avoid encoding crashes
        await message.answer("[SUCCESS] Authentication complete! You will be redirected to the Faculty Dashboard on your browser.")
    else:
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="IPD Audit", callback_data=f"view_index.html_{session_token}")],
            [InlineKeyboardButton(text="OPD Audit", callback_data=f"view_opd.html_{session_token}")]
        ])
        await message.answer(f"[SUCCESS] Hello {user['full_name']}. Which patient are you working on?", reply_markup=kb)

@dp.callback_query(F.data.startswith('view_'))
async def select_view(callback: types.CallbackQuery):
    _, target_view, session_token = callback.data.split('_', 2)
    chat_id = str(callback.from_user.id)
    sync_db_query("UPDATE auth_sessions SET status='success', target_view=%s, chat_id=%s WHERE session_token=%s", (target_view, chat_id, session_token), commit=True)
    await callback.message.edit_text("[SUCCESS] Logged in successfully! Check your browser.")
    await callback.answer()

@dp.callback_query(RegState.institute)
async def reg_institute(callback: types.CallbackQuery, state: FSMContext):
    await state.update_data(institute=callback.data.split('_')[1])
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Faculty", callback_data="role_Faculty"), InlineKeyboardButton(text="Student", callback_data="role_Student")]])
    await callback.message.edit_text("Select your status:", reply_markup=kb)
    await state.set_state(RegState.role)

@dp.callback_query(RegState.role)
async def reg_role(callback: types.CallbackQuery, state: FSMContext):
    role = callback.data.split('_')[1]
    await state.update_data(role=role)
    await callback.message.edit_text("Please reply with your Full Name:")
    await state.set_state(RegState.full_name)

@dp.message(RegState.full_name)
async def reg_name(message: types.Message, state: FSMContext):
    await state.update_data(full_name=message.text)
    data = await state.get_data()
    id_prompt = "Enrollment No." if data['role'] == "Student" else "MIS No."
    await message.answer(f"Please reply with your {id_prompt}:")
    await state.set_state(RegState.id_number)

@dp.message(RegState.id_number)
async def reg_id(message: types.Message, state: FSMContext):
    chat_id = str(message.from_user.id)
    data = await state.get_data()
    sync_db_query(
        "INSERT INTO users (chat_id, full_name, institute, role, id_number, is_approved) VALUES (%s, %s, %s, %s, %s, FALSE)",
        (chat_id, data['full_name'], data['institute'], data['role'], message.text), commit=True
    )
    await message.answer("Registration submitted! Please wait till your institute admin approves your access.")

    admin_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Approve", callback_data=f"approve_{chat_id}"), InlineKeyboardButton(text="Reject", callback_data=f"reject_{chat_id}")]
    ])
    admin_text = f"New Registration Request\nName: {data['full_name']}\nRole: {data['role']}\nInst: {data['institute']}\nID: {message.text}"
    await bot.send_message(ADMIN_CHAT_ID, admin_text, reply_markup=admin_kb)
    await state.clear()

@dp.callback_query(F.data.startswith('approve_') | F.data.startswith('reject_'))
async def admin_action(callback: types.CallbackQuery):
    action, user_chat_id = callback.data.split('_')
    if action == "approve":
        sync_db_query("UPDATE users SET is_approved=TRUE WHERE chat_id=%s", (user_chat_id,), commit=True)
        await callback.message.edit_text(callback.message.text + "\n\n[APPROVED]")
        await bot.send_message(user_chat_id, "Your account has been approved! You can now scan the QR code on the WebApp.")
    else:
        sync_db_query("DELETE FROM users WHERE chat_id=%s", (user_chat_id,), commit=True)
        await callback.message.edit_text(callback.message.text + "\n\n[REJECTED]")
        await bot.send_message(user_chat_id, "Your registration request was rejected by the Admin.")
    await callback.answer()

async def start_bot():
    await dp.start_polling(bot)
