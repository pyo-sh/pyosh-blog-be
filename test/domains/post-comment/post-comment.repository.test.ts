import { expect } from "chai";
import PostRepository from "@src/domains/post/post.repository";
import PostCommentRepository from "@src/domains/post-comment/post-comment.repository";
import UserRepository from "@src/domains/user/user.repository";
import PostCommentStub from "@stub/post-comment.stub";
import PostStub from "@stub/post.stub";
import UserStub from "@stub/user.stub";
import mockInstance from "@test/utils/mockInstance";

describe("PostComment Repository Test", () => {
  const userRepository = mockInstance(UserRepository);
  const postRepository = mockInstance(PostRepository);
  const postCommentRepository = mockInstance(PostCommentRepository);

  it("Post Comment should be deleted when Post deleted (onDelete CASCADE) [not soft delete]", async () => {
    const userStub = new UserStub();
    const newUser = await userRepository.save(userStub);
    const postStub = new PostStub({ user: newUser });
    const postCommentStub = new PostCommentStub({ post: postStub });

    const newPost = await postRepository.save(postStub);
    const newPostComment = await postCommentRepository.save(postCommentStub);
    await postRepository.delete(newPost.id);
    const foundPost = await postRepository.findOneBy({ id: newPost.id });
    const foundPostComment = await postCommentRepository.findOneBy({
      id: newPostComment.id,
    });

    expect(newPost.id).to.be.equal(postStub.id);
    expect(newPostComment.id).to.be.equal(postCommentStub.id);
    expect(foundPost).to.be.null;
    expect(foundPostComment).to.be.null;
  });
});
