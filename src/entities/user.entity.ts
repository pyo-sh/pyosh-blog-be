import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  JoinColumn,
} from "typeorm";
import { GuestbookEntity } from "@src/entities/guestbook.entity";
import { ImageEntity } from "@src/entities/image.entity";
import { PostCommentEntity } from "@src/entities/post-comment.entity";
import { PostEntity } from "@src/entities/post.entity";

@Entity("user_tb")
export class UserEntity {
  @PrimaryGeneratedColumn({ type: "int" })
  id: number;

  @Column({ type: "varchar", length: 20 })
  name: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  githubId: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  googleEmail: string | null;

  @Column({ type: "boolean", default: false })
  writable: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @Column({ type: "int", nullable: true, default: null })
  imageId: number | null;

  @ManyToOne(() => ImageEntity, (image) => image.users, {
    nullable: true,
    cascade: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "image_id", referencedColumnName: "id" })
  image?: ImageEntity;

  @OneToMany(() => GuestbookEntity, (guestbook) => guestbook.user)
  guestbooks?: GuestbookEntity[];

  @OneToMany(() => PostEntity, (post) => post.user)
  posts?: PostEntity[];

  @OneToMany(() => PostCommentEntity, (postComment) => postComment.user)
  postComments?: PostCommentEntity[];
}
