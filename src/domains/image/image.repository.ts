import { Repository } from "typeorm";
import { AutoRepository } from "@src/core";
import { ImageEntity } from "@src/entities/image.entity";

@AutoRepository(ImageEntity)
class ImageRepository extends Repository<ImageEntity> {}

export default ImageRepository;
