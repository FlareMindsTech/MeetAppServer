import Notification from "../Model/notification.js";
import User from "../Model/userSchema.js";
export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await Notification.find({
      $or: [{ recipient: userId }, { isGlobal: true }],
    })
      .sort({ createdAt: -1 })
      .lean();

    const result = notifications.map((note) => {
      const readByList = note.readBy || [];

      return {
        ...note,

        read: readByList.some((id) => id.toString() === userId),
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
// @desc    Mark notification as read (Add user to list)
// @route   POST /api/notifications/:notificationId/mark-read
export const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const note = await Notification.findById(req.params.notificationId);

    if (!note) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (note.recipient && note.recipient.toString() !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!note.readBy.includes(userId)) {
      note.readBy.push(userId);
      await note.save();
    }

    res.json({ message: "Marked as read", read: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// @desc    Create Global Announcement (Admin)
// @route   POST /api/admin/announcement/create
export const createAnnouncement = async (req, res) => {
  try {
    const { title, message } = req.body;

    const announcement = await Notification.create({
      title,
      message,
      isGlobal: true,
      type: "announcement",
    });

    res.status(201).json({ message: "Announcement created", announcement });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete Announcement (Admin)
// @route   DELETE /api/admin/announcement/delete/:id
export const deleteAnnouncement = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: "Announcement deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAllAnnouncements = async (req, res) => {
  try {
    const announcements = await Notification.find({ isGlobal: true }).sort({
      createdAt: -1,
    });

    res.json(announcements);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
