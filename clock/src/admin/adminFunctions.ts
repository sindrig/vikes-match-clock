import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

interface ListUsersResponse {
  users: Array<{
    uid: string;
    email: string | undefined;
    displayName: string | undefined;
    createdAt: string;
    lastSignIn: string | undefined;
    disabled: boolean;
  }>;
}

export async function fetchUsers(): Promise<ListUsersResponse["users"]> {
  const callable = httpsCallable<void, ListUsersResponse>(
    functions,
    "listUsers",
  );
  const result = await callable();
  return result.data.users;
}

export async function setUserLocations(
  targetUid: string,
  locations: Record<string, boolean>,
): Promise<void> {
  const callable = httpsCallable(functions, "adminWrite");
  await callable({ action: "setUserLocations", targetUid, locations });
}

export async function setUserDisabled(
  targetUid: string,
  disabled: boolean,
): Promise<void> {
  const callable = httpsCallable(functions, "adminWrite");
  await callable({ action: "setUserDisabled", targetUid, disabled });
}

export async function createInvitation(
  email: string,
  locations: Record<string, boolean>,
): Promise<void> {
  const callable = httpsCallable(functions, "adminWrite");
  await callable({ action: "createInvitation", email, locations });
}

export async function deleteInvitation(invitationId: string): Promise<void> {
  const callable = httpsCallable(functions, "adminWrite");
  await callable({ action: "deleteInvitation", invitationId });
}

export async function updateInvitation(
  invitationId: string,
  locations: Record<string, boolean>,
): Promise<void> {
  const callable = httpsCallable(functions, "adminWrite");
  await callable({ action: "updateInvitation", invitationId, locations });
}
