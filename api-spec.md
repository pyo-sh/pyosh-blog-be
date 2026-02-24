# Server API Spec

## Guestbook

### POST `/api/guestbook`

Auth: `optionalAuth`

OAuth 사용자 Request Body:

```json
{
  "body": "string (trim, 1~2000)",
  "parentId": "number (optional)",
  "isSecret": "boolean (optional, default: false)"
}
```

게스트 사용자 Request Body:

```json
{
  "body": "string (trim, 1~2000)",
  "parentId": "number (optional)",
  "isSecret": "boolean (optional, default: false)",
  "guestName": "string (trim, 1~50)",
  "guestEmail": "string (email, max 100)",
  "guestPassword": "string (4~100)"
}
```

Response `201`:

```json
{ "data": GuestbookEntryDetail }
```

### DELETE `/api/guestbook/:id`

Auth: `optionalAuth`

OAuth 사용자: body 없이 삭제 가능

게스트 사용자 Request Body:

```json
{ "guestPassword": "string (min 4)" }
```

Response `204`: no content

### `GuestbookEntryDetail` Schema

```json
{
  "id": 1,
  "parentId": null,
  "body": "...",
  "isSecret": false,
  "status": "active|deleted",
  "author": {
    "type": "oauth|guest",
    "id?": 1,
    "name": "...",
    "email?": "...",
    "avatarUrl?": "..."
  },
  "replies": [GuestbookEntryDetail],
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```
