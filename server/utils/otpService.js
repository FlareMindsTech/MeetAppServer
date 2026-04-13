import axios from "axios";

/**
 * Sends an OTP to the user's mobile number via SMS.
 * Uses Fast2SMS DLT Route with RTHUBS sender
 */
export const sendSMSOTP = async (phoneNumber, otp) => {
  try {
    console.log(`[SMS OTP] Sending to ${phoneNumber}, OTP: ${otp}`);
    console.log(`[SMS OTP] SMS_DEV_MODE value: "${process.env.SMS_DEV_MODE}"`);

    // If Dev Mode is ON, don't call the actual API
    if (process.env.SMS_DEV_MODE === "true") {
      console.log(">>> DEV MODE: Skipping API call. (Balance Saved!)");
      return { success: true, message: "OTP logged to console (Dev Mode)" };
    }

    const API_KEY = process.env.FAST2SMS_API_KEY;
    const tenDigitNumber = phoneNumber.toString().slice(-10);

    const url = "https://www.fast2sms.com/dev/bulkV2";

    const payload = {
      route: "dlt",
      sender_id: "RTHUBS",
      message: "208466", // Fast2SMS internal message ID
      variables_values: otp, // replaces {#var#}
      numbers: tenDigitNumber, // 10-digit number only
    };

    console.log(`[SMS OTP] Calling Fast2SMS DLT Route for number: ${tenDigitNumber}`);

    const response = await axios.post(url, payload, {
      headers: {
        authorization: API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log("[SMS OTP] Fast2SMS Response:", JSON.stringify(response.data));

    if (!response.data?.return) {
      const err = new Error("Fast2SMS rejected the request");
      err.name = "SmsError";
      err.provider = "fast2sms";
      err.details = response.data;
      throw err;
    }

    return { success: true, message: "OTP sent successfully via Fast2SMS DLT Route" };
  } catch (error) {
    const apiData = error.response?.data;
    const providerMessage = apiData?.message || apiData?.error || error.message;

    console.error(`[SMS OTP] SMS failed: ${providerMessage}`, apiData || {});

    const err = new Error(`SMS failed: ${providerMessage}`);
    err.name = "SmsError";
    err.provider = "fast2sms";
    err.status = error.response?.status || 502;
    err.details = apiData || {};

    throw err;
  }
};
