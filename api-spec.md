# Server API Spec

## Admin Posts

### GET `/admin/posts`

Auth: `requireAdmin`

Query Parameters:

| Param          | Type    | Default      | Description                            |
|----------------|---------|--------------|----------------------------------------|
| page           | number  | 1            | 페이지 번호                             |
| limit          | number  | 20           | 페이지당 개수 (max 100)                 |
| status         | string  | -            | `draft` \| `published` \| `archived`   |
| visibility     | string  | -            | `public` \| `private`                  |
| categoryId     | number  | -            | 카테고리 필터                            |
| tagSlug        | string  | -            | 태그 slug 필터                          |
| q              | string  | -            | 키워드 검색 (title, contentMd)          |
| includeDeleted | boolean | false        | 소프트 삭제된 글 포함 여부                |
| sort           | string  | created_at   | 정렬 기준 (`created_at` \| `published_at`) |
| order          | string  | desc         | 정렬 방향 (`asc` \| `desc`)             |

Response `200`:

```json
{
  "data": [PostDetail],
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

## Admin Comments

### PUT `/admin/comments/:id/hide`

Auth: `requireAdmin`

- Hides a comment from `active` to `hidden`
- Request on a `hidden` or `deleted` comment returns `400`

Response `200`:

```json
{ "success": true }
```

### PUT `/admin/comments/:id/restore`

Auth: `requireAdmin`

- Restores a comment from `deleted` or `hidden` to `active`
- Request on an `active` comment returns `400`

Response `200`:

```json
{ "success": true }
```

### DELETE `/admin/comments/bulk`

Auth: `requireAdmin`

Request Body:

```json
{
  "ids": [1, 2, 3],
  "action": "hide|restore|soft_delete|hard_delete"
}
```

- `hide`: `active -> hidden`
- `restore`: `deleted | hidden -> active`
- `soft_delete`: `active -> deleted`
- `hard_delete`: permanently delete selected comments

## Guestbook

### POST `/guestbook`

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

### DELETE `/guestbook/:id`

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
