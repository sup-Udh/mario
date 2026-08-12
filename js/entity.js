(function() {
	if (typeof Mario === 'undefined')
		window.Mario = {};

	var Entity = Mario.Entity = function(options) {
	  this.vel = [0,0];  // speed of how fast mario is moving 
	  this.acc = [0,0]; // acc of mario
		this.standing = true; // on ground or not ground determination 
	  this.pos = options.pos; // array containing x and y 
	  this.sprite = options.sprite;
	  this.hitbox = options.hitbox;
	  this.left = false;
	}

	Entity.prototype.render = function(ctx, vX, vY) {
		this.sprite.render(ctx, this.pos[0], this.pos[1], vX, vY)
	}

	Entity.prototype.collideWall = function(wall) {
		//the wall will always be a 16x16 block with hitbox = [0,0,16,16].
		if (this.pos[0] > wall.pos[0]) {
			//from the right
			this.pos[0] = wall.pos[0] + wall.hitbox[2] - this.hitbox[0];
			this.vel[0] = Math.max(0, this.vel[0]);
			this.acc[0] = Math.max(0, this.acc[0]);
		} else {
			this.pos[0] = wall.pos[0] + wall.hitbox[0] - this.hitbox[2] - this.hitbox[0];
			this.vel[0] = Math.min(0, this.vel[0]);
			this.acc[0] = Math.min(0, this.acc[0]);
		}
	}

	Entity.prototype.bump = function() {;}
})();
