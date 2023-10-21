import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  CreateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import { PostEntity } from "@src/entities/post.entity";
import { ProjectEntity } from "@src/entities/project.entity";
import { UserEntity } from "@src/entities/user.entity";

@Entity("image_tb")
export class ImageEntity {
  @PrimaryGeneratedColumn({ type: "int" })
  id: number;

  @Column({ type: "varchar", length: 255 })
  url: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => UserEntity, (user) => user.image)
  users?: UserEntity[];

  @OneToMany(() => PostEntity, (post) => post.thumbnail)
  posts?: PostEntity[];

  @OneToMany(() => ProjectEntity, (project) => project.thumbnail)
  projects?: ProjectEntity[];
}
