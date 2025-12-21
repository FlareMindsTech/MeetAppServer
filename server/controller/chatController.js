import Chat from "../Model/chat.js";

// create or get existing single chat between two users
export const getOrCreateSingleChat = async (req, res) => {
  try {
    const { receiver_id } = req.body;
    const sender_id = req.user.id;
    let chat = await Chat.findOne({
      type: "SINGLE",
      "participants.user_id": { $all: [sender_id, receiver_id] },
    });

    if (chat) {
      return res.status(200).json({ success: true, conversation_id: chat._id, data: chat });
    }


    chat = await Chat.create({
      type: "SINGLE",
      created_by: sender_id,
      participants: [
        { user_id: sender_id, role: "admin" },
        { user_id: receiver_id, role: "member" },
      ],
      messages: [],
    });

    res.status(201).json({ success: true, conversation_id: chat._id, data: chat });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



// create group chat
export const createGroupChat = async (req, res) => {
  try {
    const { title, course_id, participants } = req.body;
    const creator_id = req.user.id;

    const participantObjects = participants.map((id) => ({
      user_id: id,
      role: "member",
    }));

    participantObjects.push({ user_id: creator_id, role: "admin" });

    const newGroup = await Chat.create({
      type: course_id ? "COURSE_GROUP" : "GROUP",
      title,
      course_id: course_id || null,
      created_by: creator_id,
      participants: participantObjects,
      messages: [],
    });

    res.status(201).json({ success: true, data: newGroup });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



// manage participants in group chat
export const manageParticipants = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, action } = req.body;

    const update =
      action === "add"
        ? { $addToSet: { participants: { user_id, role: "member" } } }
        : { $pull: { participants: { user_id } } };

    const updatedChat = await Chat.findByIdAndUpdate(id, update, { new: true });
    res.status(200).json({ success: true, data: updatedChat });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// send message in a chat
export const sendMessage = async (req, res) => {
  try {
    const { conversation_id, message_type, content } = req.body;
    const sender_id = req.user.id;

    const newMessage = {
      sender_id,
      message_type: message_type || "TEXT",
      content,
      created_at: new Date(),
    };

    const chat = await Chat.findByIdAndUpdate(
      conversation_id,
      {
        $push: { messages: newMessage },
        $set: { last_message_at: new Date() },
      },
      { new: true }
    ).populate("participants.user_id", "name photo role");
     const savedMsg = chat.messages[chat.messages.length - 1];
res.status(201).json({ success: true, data: savedMsg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// get messages in a chat
export const getMessages = async (req, res) => {
  try {
    const { conversation_id } = req.query;
    const chat = await Chat.findById(conversation_id)
      .populate("messages.sender_id", "name photo role")
      .select("messages");

      if (!chat) {
      return res.status(404).json({ 
        success: false, 
        message: "Chat not found. Please check the conversation_id." 
      });
    }


    res.status(200).json({ success: true, data: chat.messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// mark message as read
export const markAsRead = async (req, res) => {
  try {
    const { conversation_id, message_id } = req.body;
await Chat.updateOne(
      { _id: conversation_id, "messages._id": message_id },
      { $set: { "messages.$.read_at": new Date() } }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// get all conversations for a user
export const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const chats = await Chat.find({ "participants.user_id": userId })
      .populate("participants.user_id", "name photo role")
      .sort({ last_message_at: -1 });

    res.status(200).json({ success: true, data: chats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};