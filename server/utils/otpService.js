import axios from "axios";

/**
 * Sends an OTP to the user's mobile number via SMS.
 * Placeholder for actual SMS gateway integration (e.g., Msg91, Textlocal, Twilio).
 */
export const sendSMSOTP = async (phoneNumber, otp) => {
  try {
    const message = `Your verification code for logging into the application is ${otp}. Please do not share it with anybody. - Aadvi Fashion Institution`;
    
    console.log(`[SMS OTP] Sending to ${phoneNumber}: ${message}`);
    console.log(`[SMS OTP] SMS_DEV_MODE value: "${process.env.SMS_DEV_MODE}"`);

    // If Dev Mode is ON, don't call the actual API
    if (process.env.SMS_DEV_MODE === "true") {
        console.log(">>> DEV MODE: Skipping API call. (Balance Saved!)");
        return { success: true, message: "OTP logged to console (Dev Mode)" };
    }

    // Fast2SMS API Integration - Using 'q' (Quick SMS) route to bypass verification
    const response = await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: process.env.FAST2SMS_API_KEY,
        route: "q",
        message: message, 
        numbers: phoneNumber,
      },
    });

    if (response.data.return === false) {
      throw new Error(response.data.message || "Fast2SMS Error");
    }

    return { success: true, message: "OTP sent successfully via Fast2SMS (Quick Route)" };
  } catch (error) {
    console.error("Error sending SMS OTP:", error);
    throw new Error("Failed to send OTP. Please try again later.");
  }
};
