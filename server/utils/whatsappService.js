import axios from "axios";

/**
 * Sends a marketing message to the user on WhatsApp.
 * This is triggered when a user clicks/checks a particular course.
 */
export const sendCourseOfferWhatsApp = async (phoneNumber, courseName) => {
  try {
    // Meta API requires phone numbers with country code (e.g., 919003513381)
    let sanitizedNumber = phoneNumber.replace(/\D/g, "");
    
    // If it's a 10-digit number, prepend 91 (default for India in this app)
    if (sanitizedNumber.length === 10) {
      sanitizedNumber = "91" + sanitizedNumber;
    }

    const message = `Hello! We saw you checking out our "${courseName}" course. 🚀\n\nDon't miss out! There's a special offer going on right now. Purchase it now to level up your skills!\n\nCheck it out in the app: aadvi://course/details`;

    console.log(`[WhatsApp Marketing] Sending to ${sanitizedNumber}: ${message}`);

    // Meta API requires a Template for the first message (Marketing/Utility)
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: sanitizedNumber,
        type: "template",
        template: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error("Error sending WhatsApp message:", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
};
