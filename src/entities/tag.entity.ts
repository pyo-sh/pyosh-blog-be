import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToMany,
} from "typeorm";
import { PostEntity } from "@src/entities/post.entity";

@Entity("tag_tb")
export class TagEntity {
  @PrimaryGeneratedColumn({ type: "int" })
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToMany(() => PostEntity, (post) => post.tags)
  posts?: PostEntity[];
}
