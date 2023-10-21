import { Repository } from "typeorm";
import { AutoRepository } from "@src/core";
import { TagEntity } from "@src/entities/tag.entity";

@AutoRepository(TagEntity)
class TagRepository extends Repository<TagEntity> {}

export default TagRepository;
