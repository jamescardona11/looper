import { Directory, File, Paths } from "expo-file-system";

const MEETINGS_DIRECTORY = new Directory(Paths.document, "looper-meetings");

function meetingAudioFile(meetingId: string): File {
  return new File(MEETINGS_DIRECTORY, `${meetingId}.m4a`);
}

/** Conserva el original sólo en Documents, separado por identidad de reunión. */
export async function persistMeetingAudio(meetingId: string, sourceUri: string): Promise<string> {
  MEETINGS_DIRECTORY.create({ idempotent: true, intermediates: true });
  const destination = meetingAudioFile(meetingId);
  if (destination.exists) destination.delete();
  await new File(sourceUri).copy(destination);
  return destination.uri;
}

export function localMeetingAudioUri(meetingId: string): string | null {
  const audio = meetingAudioFile(meetingId);
  return audio.exists ? audio.uri : null;
}
