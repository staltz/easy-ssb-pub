FROM buildpack-deps:xenial

RUN groupadd -r node && useradd -r -g node node

RUN echo "deb http://archive.ubuntu.com/ubuntu xenial main universe" >> /etc/apt/sources.list
RUN apt-get update
RUN apt-get upgrade -y

RUN apt-get install -y libleveldb-dev

ENV NPM_CONFIG_LOGLEVEL info
ENV NODE_VERSION 6.9.1

RUN apt-get install curl libc6 libcurl3 zlib1g libtool autoconf

RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.1/install.sh | bash
RUN nvm install "v$NODE_VERSION"
RUN export NVM_DIR="$HOME/.nvm"
RUN [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

RUN git clone https://github.com/jedisct1/libsodium.git
RUN cd /libsodium && git checkout && ./autogen.sh
RUN cd /libsodium && ./configure && make && make check && make install

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install
RUN npm install node-gyp libsodium
COPY . /usr/src/app

CMD [ "npm", "start" ]
