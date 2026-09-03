const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "YOUR_AUTOMATED_GMAIL@gmail.com",
    pass: "YOUR_GMAIL_APP_PASSWORD"
  }
});

// Scheduled daily cron trigger checking upcoming target dates
exports.scheduledStudentReminderCheck = functions.pubsub
  .schedule("0 8 * * *") // Daily at 8:00 AM
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = new Date();
    
    const snapshot = await db.collection("students").get();

    snapshot.forEach(async (docSnap) => {
      const student = docSnap.data();
      if (!student.reminderDate) return;

      const targetDate = new Date(student.reminderDate);
      
      // Calculate 11-month milestone date
      const elevenMonthsAfter = new Date(targetDate);
      elevenMonthsAfter.setMonth(elevenMonthsAfter.getMonth() + 11);

      // Calculate 3 days prior to 1 year milestone date
      const yearMinusThreeDays = new Date(targetDate);
      yearMinusThreeDays.setFullYear(yearMinusThreeDays.getFullYear() + 1);
      yearMinusThreeDays.setDate(yearMinusThreeDays.getDate() - 3);

      // Get added employee details
      const userSnap = await db.collection("users").doc(student.addedByUid).get();
      if (!userSnap.exists) return;
      const employeeEmail = userSnap.data().email;

      // Check for 11-Month Trigger
      if (isSameDay(now, elevenMonthsAfter)) {
        await transporter.sendMail({
          from: "System Notification <noreply@system.com>",
          to: employeeEmail,
          subject: "Student Milestone Notification - 1 Month Remaining",
          text: `Hello ${student.addedByUsername}, the student ${student.name} has 1 month remaining before completing a year.`
        });
      }

      // Check for 3-Day Trigger
      if (isSameDay(now, yearMinusThreeDays)) {
        await transporter.sendMail({
          from: "System Notification <noreply@system.com>",
          to: employeeEmail,
          subject: "Urgent Milestone Notification - 3 Days Remaining",
          text: `Hello ${student.addedByUsername}, the student ${student.name} has 3 days remaining to complete the full year.`
        });
      }
    });
  });

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}
