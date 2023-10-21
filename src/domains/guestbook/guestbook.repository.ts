import { Repository } from "typeorm";
import { AutoRepository } from "@src/core";
import { GuestbookEntity } from "@src/entities/guestbook.entity";

@AutoRepository(GuestbookEntity)
class GuestbookRepository extends Repository<GuestbookEntity> {}

export default GuestbookRepository;
