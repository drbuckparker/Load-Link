// Focused validation for push payloads: every Expo push message must carry an
// explicit iOS sound (omitting it = silent delivery) plus an interruption
// level, channelId, and high priority. Run with: npx tsx scripts/test-push-payload.ts
import {
  buildExpoPushMessage,
  buildNewJobNearbyPush,
  buildJobAwardedPush,
  PUSH_SOUNDS,
  PUSH_CHANNELS,
} from "../server/push-payload";
import { readFileSync, existsSync } from "fs";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}`); }
}

// 1. Default message (general notifications like job applications).
const m1 = buildExpoPushMessage({ to: "ExponentPushToken[x]", title: "T", body: "B" });
check("default sound is 'default' (never omitted)", m1.sound === "default");
check("default interruptionLevel is 'active'", m1.interruptionLevel === "active");
check("default channelId is 'default'", m1.channelId === "default");
check("priority is 'high'", m1.priority === "high");
check("data defaults to {}", typeof m1.data === "object" && m1.data !== null);

// 2. New-job truck-horn message.
const m2 = buildExpoPushMessage({
  to: "ExponentPushToken[y]", title: "T", body: "B",
  sound: "truckhorn.wav", channelId: "job-alerts", interruptionLevel: "timeSensitive",
  data: { type: "new_job", jobId: "1" },
});
check("custom sound preserved", m2.sound === "truckhorn.wav");
check("job-alerts channel preserved", m2.channelId === "job-alerts");
check("timeSensitive preserved", m2.interruptionLevel === "timeSensitive");

// 3. Degenerate sound values must fall back to 'default', never silent.
check("empty sound falls back to 'default'", buildExpoPushMessage({ to: "t", title: "T", body: "B", sound: "" }).sound === "default");
check("whitespace sound falls back to 'default'", buildExpoPushMessage({ to: "t", title: "T", body: "B", sound: "  " }).sound === "default");
check("undefined sound falls back to 'default'", buildExpoPushMessage({ to: "t", title: "T", body: "B", sound: undefined }).sound === "default");

// 4. Business event: new job within a driver's radius → truck horn.
const nj = buildNewJobNearbyPush({ to: "t", title: "New Job", body: "B", jobId: "j1" });
check("new-job event plays truckhorn.wav", nj.sound === "truckhorn.wav" && nj.sound === PUSH_SOUNDS.NEW_JOB);
check("new-job event uses 'job-alerts' Android channel", nj.channelId === "job-alerts" && nj.channelId === PUSH_CHANNELS.NEW_JOB);
check("new-job event is timeSensitive", nj.interruptionLevel === "timeSensitive");
check("new-job event data.type is 'new_job' (foreground horn trigger)", nj.data.type === "new_job" && nj.data.jobId === "j1");

// 5. Business event: driver awarded/approved a job → cash register.
const aw = buildJobAwardedPush({ to: "t", title: "You Got the Job!", body: "B", jobId: "j2" });
check("awarded event plays cashregister.wav", aw.sound === "cashregister.wav" && aw.sound === PUSH_SOUNDS.JOB_AWARDED);
check("awarded event uses dedicated 'job-awarded' Android channel (channel sounds are immutable)", aw.channelId === "job-awarded" && aw.channelId === PUSH_CHANNELS.JOB_AWARDED);
check("awarded event is timeSensitive", aw.interruptionLevel === "timeSensitive");
check("awarded event data.type is 'job_awarded' (foreground cash-register trigger)", aw.data.type === "job_awarded" && aw.data.jobId === "j2");
check("awarded and new-job sounds/channels are distinct", aw.sound !== nj.sound && aw.channelId !== nj.channelId);

// 6. Bundled asset + app.json plugin config must include both custom sounds
//    (an unknown sound name = silent on iOS).
const appJson = JSON.parse(readFileSync("app.json", "utf8"));
const pluginSounds: string[] = (appJson.expo.plugins.find((p: any) => Array.isArray(p) && p[0] === "expo-notifications")?.[1]?.sounds) || [];
for (const s of [PUSH_SOUNDS.NEW_JOB, PUSH_SOUNDS.JOB_AWARDED]) {
  check(`${s} exists in assets/sounds/`, existsSync(`assets/sounds/${s}`));
  check(`${s} listed in app.json expo-notifications sounds`, pluginSounds.some((p) => p.endsWith(`/${s}`)));
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll push payload checks passed");
