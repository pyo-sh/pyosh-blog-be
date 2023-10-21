import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToMany,
  JoinTable,
} from "typeorm";
import envs from "@src/constants/env";
import { NodeEnv } from "@src/constants/node-env";
import { ImageEntity } from "@src/entities/image.entity";
import { PostCommentEntity } from "@src/entities/post-comment.entity";
import { TagEntity } from "@src/entities/tag.entity";
import { UserEntity } from "@src/entities/user.entity";

@Entity("post_tb")
export class PostEntity {
  @PrimaryGeneratedColumn({ type: "int" })
  id: number;

  @Column({ type: envs.NODE_ENV === NodeEnv.TEST ? "text" : "longtext" })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @Column({ type: "int", nullable: true })
  thumbnailId: number | null;

  @ManyToOne(() => ImageEntity, (image) => image.posts, {
    nullable: true,
    cascade: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "thumbnail_id" })
  thumbnail?: ImageEntity;

  @Column({ type: "int" })
  userId: number;

  @ManyToOne(() => UserEntity, (user) => user.posts, {
    cascade: true,
    onDelete: "CASCADE",
  })
  user?: UserEntity;

  @ManyToMany(() => TagEntity, (tag) => tag.posts, { cascade: true })
  @JoinTable({
    joinColumn: { name: "post_id" },
    inverseJoinColumn: { name: "tag_id" },
    name: "post_tag_tb",
  })
  tags?: TagEntity[];

  @OneToMany(() => PostCommentEntity, (comment) => comment.post)
  comments?: PostCommentEntity[];
}
