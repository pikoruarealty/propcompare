import { errorResponse } from "@/lib/properties/http";
import type { InviteError } from "@/lib/developers/invites";

/** Maps an invite failure to the documented error envelope. */
export const inviteErrorResponse = (error: InviteError): Response => {
  switch (error.code) {
    case "developer_not_found":
    case "member_not_found":
      return errorResponse(404, error.code, error.message);
    case "invalid_email":
    case "weak_password":
      return errorResponse(422, "invalid_email", error.message);
    case "account_exists":
    case "already_member":
      return errorResponse(409, error.code, error.message);
    default:
      return errorResponse(409, "invalid_state", error.message);
  }
};
