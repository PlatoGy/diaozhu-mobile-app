import { NextResponse } from "next/server";

import { apiErrorResponse, type ApiError } from "@/src/lib/api/errors";
import { configurationErrorResponse } from "@/src/lib/api/room-errors";
import { readAdminSecretHeader, verifyAdminSecret } from "@/src/lib/auth/admin";
import { getSql } from "@/src/lib/db";
import { roomIdSchema } from "@/src/lib/validation/rooms";

export const dynamic = "force-dynamic";

type DeleteRoomResponse = {
  deleted: true;
  roomId: string;
};

type DeleteRoomContext = {
  params: Promise<{
    roomId: string;
  }>;
};

function unauthorizedResponse() {
  return apiErrorResponse("UNAUTHORIZED", "Invalid admin secret.", 401);
}

export async function DELETE(
  request: Request,
  context: DeleteRoomContext,
): Promise<NextResponse<DeleteRoomResponse | ApiError>> {
  const { roomId } = await context.params;
  const parsedRoomId = roomIdSchema.safeParse(roomId);

  if (!parsedRoomId.success) {
    return apiErrorResponse("INVALID_ROOM_ID", "Room ID must be a valid UUID.", 400);
  }

  const adminSecret = readAdminSecretHeader(request);

  if (!adminSecret) {
    return unauthorizedResponse();
  }

  try {
    if (!verifyAdminSecret(adminSecret)) {
      return unauthorizedResponse();
    }

    const sql = getSql();
    const rows = await sql`
      delete from rooms
      where id = ${parsedRoomId.data}
      returning id
    `;

    if (rows.length === 0) {
      return apiErrorResponse("ROOM_NOT_FOUND", "Room does not exist.", 404);
    }

    return NextResponse.json({
      deleted: true,
      roomId: parsedRoomId.data,
    });
  } catch (error) {
    const configResponse = configurationErrorResponse(error);

    if (configResponse) {
      return configResponse;
    }

    return apiErrorResponse("ROOM_DELETE_FAILED", "Room could not be deleted.", 500);
  }
}
