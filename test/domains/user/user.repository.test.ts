import { expect } from "chai";
import ImageRepository from "@src/domains/image/image.repository";
import UserRepository from "@src/domains/user/user.repository";
import ImageStub from "@stub/image.stub";
import UserStub from "@stub/user.stub";
import mockInstance from "@test/utils/mockInstance";

describe("User Repository Test", () => {
  const userRepository = mockInstance(UserRepository);
  const imageRepository = mockInstance(ImageRepository);

  it("Image can be created with user repository (CASCADE)", async () => {
    const imageStub = new ImageStub();
    const userStub = new UserStub({ image: imageStub });

    const userData = userRepository.create(userStub);
    const newUser = await userRepository.save(userData);
    const createdImage = await imageRepository.findOneBy({
      id: newUser.image.id,
    });

    expect(createdImage).to.be.deep.equal(imageStub);
  });

  it("imageId should be null when Image deleted (onDelete SET NULL) [not soft delete]", async () => {
    const imageStub = new ImageStub();
    const userStub = new UserStub({ image: imageStub });
    const newImage = await imageRepository.save(imageStub);
    const newUser = await userRepository.save(userStub);

    await imageRepository.delete(newImage.id);
    const foundImage = await imageRepository.findOneBy({ id: newImage.id });
    const foundUser = await userRepository.findOneBy({ id: newUser.id });

    expect(newUser.imageId).to.be.equal(newImage.id);
    expect(foundImage).to.be.null;
    expect(foundUser.imageId).to.be.null;
  });
});
