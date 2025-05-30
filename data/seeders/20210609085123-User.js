'use strict'

module.exports = {
	up: async (queryInterface, Sequelize) => {
		/**
		 * Add seed commands here.
		 *
		 * Example:
		 * await queryInterface.bulkInsert('People', [{
		 *   name: 'John Doe',
		 *   isBetaMember: false
		 * }], {});
		 */
		await queryInterface.bulkInsert(
			'Users',
			[
				{
					resourceType: 'internal',
					username: 'admin',
					password: 'e10adc3949ba59abbe56e057f20f883e', // 123456
					decryptPassword: '123456',
					role: 'admin',
					menus: 'all',
					type: 'user',
					age: 0,
					fullname: 'Admin',
					sex: 1,
					address: '',
					email: '',
					mphone: '',
					avatar: '',
					path: '1',
					createdBy: JSON.stringify({}),
					code: 'admin',
					description: '',
					birthplace: '',
					certType: '',
					certNo: '',
					status: true,
					deptId: 1,
					postId: 1,
					remarks: '',
					createdAt: new Date(),
					updatedAt: new Date()
				}
			],
			{}
		)
	},

	down: async (queryInterface, Sequelize) => {
		/**
		 * Add commands to revert seed here.
		 *
		 * Example:
		 * await queryInterface.bulkDelete('People', null, {});
		 */
	}
}
