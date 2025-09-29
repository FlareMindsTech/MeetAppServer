
import User from "../Model/userSchema.js";
import Meeting from "../Model/meet.js";  
import bcrypt from "bcryptjs";  


// Create student/admin/owner

// export const createUser = async (req, res) => {
//   try {
//     let { FirstName, LastName, email, phoneNumber, role } = req.body;

//     // 1️⃣ Validate input
//     if (!FirstName || !LastName || !email ) {
//       return res.status(400).json({ message: "FirstName, LastName, email, and role are required" });
//     }

//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(email)) {
//       return res.status(400).json({ message: "Invalid email format" });
//     }

//     if (phoneNumber && !/^\d{10}$/.test(phoneNumber)) {
//       return res.status(400).json({ message: "Phone number must be 10 digits" });
//     }

//     // 2️⃣ Check if email exists
//     const existing = await User.findOne({ email });
//     if (existing) return res.status(400).json({ message: "Email already exists" });

//     // 3️⃣ Capitalize first letter
//     const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
//     FirstName = capitalize(FirstName);
//     LastName = capitalize(LastName);

//     // 4️⃣ Generate random password
//     const rawPassword = Math.random().toString(36).slice(-8);

//     // 5️⃣ Save user
//     const newUser = new User({
//       FirstName,
//       LastName,
//       email,
//       phoneNumber,
//       password: rawPassword,
//       role,
//     });

//     await newUser.save();

//     res.status(201).json({
//       message: "User created successfully",
//       user: { FirstName, LastName, email, phoneNumber, role }
//     });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };



export const createUser = async (req, res) => {
  try {
    let { FirstName, LastName, email, phoneNumber, role, password } = req.body;

    // 1️⃣ Validate input
    if (!FirstName || !LastName || !email || !role) {
      return res.status(400).json({ message: "FirstName, LastName, email, and role are required" });
    }

    if (role.toLowerCase() === "admin" && !password) {
      return res.status(400).json({ message: "Password is required when creating an admin" });
    }

    if (password && password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (phoneNumber && !/^\d{10}$/.test(phoneNumber)) {
      return res.status(400).json({ message: "Phone number must be 10 digits" });
    }

    // 2️⃣ Check if email exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    // 3️⃣ Capitalize first letter
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    FirstName = capitalize(FirstName);
    LastName = capitalize(LastName);

    // 4️⃣ Handle password
    let rawPassword;
    if (!password && role.toLowerCase() === "student") {
      rawPassword = Math.random().toString(36).slice(-8); // Generate temp password for students
      password = rawPassword;
      // Optionally send email to student here with rawPassword
      console.log(`📧 Send this password to student: ${rawPassword}`);
    } else if (password && role.toLowerCase() === "admin") {
      rawPassword = password; // Owner-defined password
    }

   

    // 5️⃣ Save user
    const newUser = new User({
      FirstName,
      LastName,
      email,
      phoneNumber,
      password,
      role,
    });

    await newUser.save();

    res.status(201).json({
      message: `${role} created successfully`,
      user: { FirstName, LastName, email, phoneNumber, role },
      ...(rawPassword && role.toLowerCase() === "admin" && { password: rawPassword }) // Show admin password only to owner
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// Get all users
// export const getUsers = async (req, res) => {
//   try {
//     let filter = {};
//     if (req.user.role === "admin") filter = { role: "student" };
//     if (req.user.role === "owner") filter = { role: { $in: ["admin", "student"] } };

//     let projection = "-password"; // always hide hashed password
//     if (!["owner", "admin"].includes(req.user.role)) {
//       projection += " -rawPassword"; // students cannot see raw password
//     }

//     const users = await User.find(filter).select(projection);
//     res.json(users);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };
export const getUsers = async (req, res) => {
  try {
    const { search, role } = req.query;

    // Base filter based on logged-in user's role
    let baseFilter = {};
    if (req.user.role === "admin") baseFilter.role = "student"; // admin sees only students
    if (req.user.role === "owner") baseFilter.role = { $in: ["admin", "student"] }; // owner sees admins + students

    const andFilters = [baseFilter];

    // Search filter
    if (search) {
      const regex = new RegExp(search, "i"); // case-insensitive
      andFilters.push({
        $or: [
          { FirstName: regex },
          { LastName: regex },
          { email: regex },
          { phoneNumber: regex },
          { role: regex },
        ],
      });
    }

    // Role filter (from query)
    if (role) {
      if (Array.isArray(role)) andFilters.push({ role: { $in: role } });
      else andFilters.push({ role });
    }

    const finalFilter = andFilters.length > 1 ? { $and: andFilters } : andFilters[0];

    // Hide passwords
    let projection = "-password";
    if (!["owner", "admin"].includes(req.user.role)) projection += " -rawPassword";

    const users = await User.find(finalFilter).select(projection);

    if (!users.length)
      return res.status(404).json({ success: false, message: "No users found" });

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};










function parseAMPM(time) {
  if (!time) return null;
  const match = time.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s?(am|pm)$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3];

  if (modifier === "pm" && hours < 12) hours += 12;
  if (modifier === "am" && hours === 12) hours = 0;

  return { hours, minutes };
}

// export const getMeetings = async (req, res) => {

//   try {
//     const meetings = await Meeting.find().populate("students.studentId");
//     const now = new Date();

//     const meetingsWithStatus = meetings.map((meeting) => {
//       const parsedEnd = parseAMPM(meeting.endTime);
//       if (!parsedEnd) {
//         // If parsing fails, default to upcoming
//         return { ...meeting.toObject(), status: "Upcoming" };
//       }

//       // Use local time instead of UTC
//       const startDateTime = new Date(meeting.date);
//       const endDateTime = new Date(meeting.date);
//       endDateTime.setHours(parsedEnd.hours, parsedEnd.minutes, 0, 0);

//       let status;
//       if (now < startDateTime) {
//         status = "Upcoming";
//       } else if (now >= startDateTime && now <= endDateTime) {
//         status = "Ongoing";
//       } else {
//         status = "Completed";
//       }

//       return { ...meeting.toObject(), status };
//     });

//     res.json(meetingsWithStatus);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };



// function parseAMPM(time) {
//   if (!time) return null;
//   const match = time.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s?(am|pm)$/);
//   if (!match) return null;

//   let hours = parseInt(match[1], 10);
//   const minutes = parseInt(match[2], 10);
//   const modifier = match[3];

//   if (modifier === "pm" && hours < 12) hours += 12;
//   if (modifier === "am" && hours === 12) hours = 0;

//   return { hours, minutes };
// }

// export const getMeetings = async (req, res) => {
//   try {
//     const meetings = await Meeting.find().populate("students.studentId");
//     const now = new Date();

//     const meetingsWithStatus = [];

//     for (let meeting of meetings) {
//       const parsedEnd = parseAMPM(meeting.endTime);
//       let status = "Upcoming"; // default

//       if (parsedEnd) {
//         const startDateTime = new Date(meeting.date);
//         const endDateTime = new Date(meeting.date);
//         endDateTime.setHours(parsedEnd.hours, parsedEnd.minutes, 0, 0);

//         if (now < startDateTime) status = "Upcoming";
//         else if (now >= startDateTime && now <= endDateTime) status = "Ongoing";
//         else status = "Completed";
//       }

//       // Update status in DB if it changed
//       if (meeting.status !== status) {
//         meeting.status = status;
//         await meeting.save(); // save updated status
//       }

//       meetingsWithStatus.push({ ...meeting.toObject(), status });
//     }

//     res.json(meetingsWithStatus);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };


// Get single user
export const getMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find().populate("students.studentId");
    const now = new Date();

    const meetingsWithStatus = await Promise.all(
      meetings.map(async (meeting) => {
        const parsedEnd = parseAMPM(meeting.endTime);

        const startDateTime = new Date(meeting.date);
        const endDateTime = new Date(meeting.date);

        if (parsedEnd) {
          endDateTime.setHours(parsedEnd.hours, parsedEnd.minutes, 0, 0);
        }

        let status;
        if (now < startDateTime) {
          status = "Upcoming";
        } else if (now >= startDateTime && now <= endDateTime) {
          status = "Ongoing";
        } else {
          status = "Completed";
        }

        // ✅ Save status back to DB if it changed
        if (meeting.status !== status) {
          meeting.status = status;
          await meeting.save();
        }

        return meeting.toObject();
      })
    );

    res.json(meetingsWithStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};







export const getUserById = async (req, res) => {
  try {
    let projection = "-password";
    if (req.user.role === "student") projection += " -rawPassword";

    const user = await User.findById(req.params.id).select(projection);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user.role === "admin" && user.role !== "student")
      return res.status(403).json({ message: "Admins can only view students" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { FirstName, LastName, email, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user.role === "admin" && user.role !== "student")
      return res.status(403).json({ message: "Admins can only update students" });

    if (FirstName) user.FirstName = FirstName;
    if (LastName) user.LastName = LastName;
    if (email) user.email = email;
    if (req.user.role === "owner" && role) user.role = role;

    await user.save();
    res.json({ message: "User updated", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user.role === "admin" && user.role !== "student") {
      return res.status(403).json({ message: "Admins can only delete students" });
    }

    // owner can delete anyone
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Compare with hashed password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Old password is incorrect" });

    // Assign plain password — pre-save hook will hash it automatically
    user.password = newPassword; 
    user.firstLogin = false;

    await user.save(); // pre-save hashes the password
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
