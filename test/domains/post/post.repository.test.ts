import { expect } from "chai";
import ImageRepository from "@src/domains/image/image.repository";
import PostRepository from "@src/domains/post/post.repository";
import TagRepository from "@src/domains/tag/tag.repository";
import UserRepository from "@src/domains/user/user.repository";
import ImageStub from "@stub/image.stub";
import PostStub from "@stub/post.stub";
import TagStub from "@stub/tag.stub";
import UserStub from "@stub/user.stub";
import mockInstance from "@test/utils/mockInstance";

describe("Post Repository Test", () => {
  const userRepository = mockInstance(UserRepository);
  const postRepository = mockInstance(PostRepository);
  const tagRepository = mockInstance(TagRepository);
  const imageRepository = mockInstance(ImageRepository);

  it("Tags can be created with post repository (CASCADE)", async () => {
    const userStub = new UserStub();
    const user = await userRepository.save(userStub);
    const tagStub1 = new TagStub();
    const tagStub2 = new TagStub();
    const postStub = new PostStub({ user, tags: [tagStub1, tagStub2] });

    const postData = postRepository.create(postStub);
    const newPost = await postRepository.save(postData);
    const createdTags = await Promise.all(
      newPost.tags.map(({ id }) => tagRepository.findOneBy({ id })),
    );

    expect([tagStub1.id, tagStub2.id]).to.have.members(
      createdTags.map(({ id }) => id),
    );
  });

  it("Post should be deleted when User deleted (onDelete CASCADE) [not soft delete]", async () => {
    const userStub = new UserStub();
    const newUser = await userRepository.save(userStub);
    const postStub = new PostStub({ user: newUser });
    const newPost = await postRepository.save(postStub);

    await userRepository.delete(newUser.id);
    const foundUser = await userRepository.findOneBy({ id: newUser.id });
    const foundPost = await postRepository.findOneBy({ id: newPost.id });

    expect(newPost.id).to.be.equal(postStub.id);
    expect(foundUser).to.be.null;
    expect(foundPost).to.be.null;
  });

  it("thumbnail(Image) can be created with Post (CASCADE)", async () => {
    const userStub = new UserStub();
    const user = await userRepository.save(userStub);
    const imageStub = new ImageStub();
    const postStub = new PostStub({ user, thumbnail: imageStub });

    const newPost = await postRepository.save(postStub);
    const createdImage = await imageRepository.findOneBy({
      id: newPost.thumbnailId,
    });

    expect(createdImage).to.be.deep.equal(imageStub);
  });

  it("thumbnailId should be null when Image deleted (onDelete SET NULL) [not soft delete]", async () => {
    const userStub = new UserStub();
    const user = await userRepository.save(userStub);
    const imageStub = new ImageStub();
    const newImage = await imageRepository.save(imageStub);
    const postStub = new PostStub({ user, thumbnail: imageStub });
    const newPost = await postRepository.save(postStub);

    await imageRepository.delete(newImage.id);
    const foundImage = await imageRepository.findOneBy({ id: newImage.id });
    const foundPost = await postRepository.findOneBy({
      id: newPost.id,
    });

    expect(newPost.thumbnailId).to.be.equal(newImage.id);
    expect(foundImage).to.be.null;
    expect(foundPost.thumbnailId).to.be.null;
  });
});
